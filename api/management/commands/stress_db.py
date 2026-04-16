import json
import random
import shutil
import statistics
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

from django.core.management.base import BaseCommand, CommandError
from django.db import OperationalError, connections, transaction
from django.db.models import F, Prefetch, Sum

from api.models import Department, ProductPackage, ProductVariant, StockMovement


def percentile(values, p):
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    rank = (len(ordered) - 1) * (p / 100.0)
    low = int(rank)
    high = min(low + 1, len(ordered) - 1)
    if low == high:
        return float(ordered[low])
    weight = rank - low
    return float(ordered[low] * (1 - weight) + ordered[high] * weight)


def to_ms(seconds):
    return round(seconds * 1000.0, 2)


class Command(BaseCommand):
    help = "Executa teste de estresse no banco e gera relatorio visual (HTML + JSON)."

    def add_arguments(self, parser):
        parser.add_argument("--threads", type=int, default=8, help="Numero de threads concorrentes.")
        parser.add_argument(
            "--ops-per-thread",
            type=int,
            default=250,
            help="Quantidade de operacoes por thread.",
        )
        parser.add_argument(
            "--read-ratio",
            type=float,
            default=0.8,
            help="Proporcao de leituras (0.0 a 1.0). Ex: 0.8 = 80%% leitura.",
        )
        parser.add_argument(
            "--retries",
            type=int,
            default=2,
            help="Tentativas extras em erro transiente de lock no SQLite.",
        )
        parser.add_argument(
            "--write-mode",
            choices=["real", "dry-run"],
            default="real",
            help=(
                "Controla escrita: real = grava no banco (altera estoque); "
                "dry-run = exercita escrita com rollback (nao altera dados)."
            ),
        )
        parser.add_argument(
            "--output",
            default="stress-report.html",
            help="Caminho do relatorio HTML de saida.",
        )
        parser.add_argument(
            "--json-output",
            default="stress-report.json",
            help="Caminho do relatorio JSON de saida.",
        )
        parser.add_argument(
            "--serve",
            action="store_true",
            help="Sobe um servidor HTTP local para visualizar o relatorio no navegador.",
        )
        parser.add_argument(
            "--port",
            type=int,
            default=8787,
            help="Porta do servidor local quando usar --serve.",
        )
        parser.add_argument(
            "--open-browser",
            action="store_true",
            help="Abre o navegador automaticamente quando usar --serve.",
        )
        parser.add_argument(
            "--cleanup-age-minutes",
            type=float,
            default=2.0,
            help=(
                "Remove automaticamente relatorios antigos na pasta de saida "
                "(em minutos). Use 0 para desativar."
            ),
        )

    def handle(self, *args, **options):
        threads = options["threads"]
        ops_per_thread = options["ops_per_thread"]
        read_ratio = options["read_ratio"]
        retries = options["retries"]
        write_mode = options["write_mode"]
        html_path = Path(options["output"]).resolve()
        json_path = Path(options["json_output"]).resolve()
        serve = options["serve"]
        port = options["port"]
        open_browser = options["open_browser"]
        cleanup_age_minutes = options["cleanup_age_minutes"]

        if threads < 1 or ops_per_thread < 1:
            raise CommandError("Use --threads >= 1 e --ops-per-thread >= 1.")
        if read_ratio < 0.0 or read_ratio > 1.0:
            raise CommandError("Use --read-ratio entre 0.0 e 1.0.")

        if cleanup_age_minutes < 0:
            raise CommandError("Use --cleanup-age-minutes >= 0.")

        variant_ids = list(ProductVariant.objects.values_list("id", flat=True))
        if not variant_ids:
            raise CommandError(
                "Nao ha itens em ProductVariant para testar. Rode seed antes (ex: manage.py seed_products)."
            )

        self.stdout.write(
            self.style.NOTICE(
                f"Iniciando stress test: {threads} threads x {ops_per_thread} ops (read_ratio={read_ratio:.2f})"
            )
        )

        lock = threading.Lock()
        latencies = []
        per_op = {
            "read_catalog": [],
            "read_metrics": [],
            "read_movements": [],
            "write_receive": [],
        }
        errors = []

        def op_read_catalog():
            list(
                ProductVariant.objects.select_related("product", "product__category")
                .prefetch_related(
                    Prefetch(
                        "packages",
                        queryset=ProductPackage.objects.filter(is_active=True).only(
                            "id",
                            "variant_id",
                            "name",
                            "units_per_package",
                            "is_default",
                            "is_active",
                        ),
                    ),
                    Prefetch(
                        "product__departments",
                        queryset=Department.objects.only("id", "name"),
                    ),
                )
                .filter(is_active=True)
                .order_by("-updated_at")[:25]
            )

        def op_read_metrics():
            queryset = ProductVariant.objects.all()
            queryset.count()
            queryset.filter(is_active=True).count()
            queryset.aggregate(total=Sum("stock"))["total"] or 0
            queryset.filter(stock__lt=5).count()

        def op_read_movements():
            list(
                StockMovement.objects.select_related("variant", "package")
                .order_by("-created_at", "-id")[:50]
            )

        def op_write_receive():
            variant_id = random.choice(variant_ids)
            units = random.randint(1, 3)
            with transaction.atomic():
                updated = ProductVariant.objects.filter(id=variant_id).update(stock=F("stock") + units)
                if updated != 1:
                    raise RuntimeError(f"Variant {variant_id} nao encontrado para update.")
                StockMovement.objects.create(
                    variant_id=variant_id,
                    movement_type=StockMovement.MOVEMENT_RECEIVE,
                    package=None,
                    package_quantity=1,
                    units_delta=units,
                    notes="stress-test",
                    created_by=None,
                )
                if write_mode == "dry-run":
                    transaction.set_rollback(True)

        read_ops = [("read_catalog", op_read_catalog), ("read_metrics", op_read_metrics), ("read_movements", op_read_movements)]

        def execute_with_retry(op_name, fn):
            for attempt in range(retries + 1):
                try:
                    started = time.perf_counter()
                    fn()
                    elapsed = time.perf_counter() - started
                    with lock:
                        latencies.append(elapsed)
                        per_op[op_name].append(elapsed)
                    return
                except OperationalError as exc:
                    message = str(exc).lower()
                    transient = "locked" in message or "busy" in message
                    if transient and attempt < retries:
                        time.sleep(0.01 * (attempt + 1))
                        continue
                    with lock:
                        errors.append(f"{op_name}: {exc}")
                    return
                except Exception as exc:  # noqa: BLE001
                    with lock:
                        errors.append(f"{op_name}: {exc}")
                    return

        def worker():
            connections.close_all()
            for _ in range(ops_per_thread):
                if random.random() < read_ratio:
                    op_name, fn = random.choice(read_ops)
                else:
                    op_name, fn = ("write_receive", op_write_receive)
                execute_with_retry(op_name, fn)
            connections.close_all()

        started_at = time.perf_counter()
        with ThreadPoolExecutor(max_workers=threads) as pool:
            futures = [pool.submit(worker) for _ in range(threads)]
            for future in as_completed(futures):
                future.result()
        total_duration = time.perf_counter() - started_at

        success_count = len(latencies)
        error_count = len(errors)
        total_count = success_count + error_count

        report = {
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "settings": {
                "threads": threads,
                "ops_per_thread": ops_per_thread,
                "target_operations": threads * ops_per_thread,
                "read_ratio": read_ratio,
                "retries": retries,
                "write_mode": write_mode,
            },
            "results": {
                "total_duration_seconds": round(total_duration, 3),
                "success_count": success_count,
                "error_count": error_count,
                "error_rate_pct": round((error_count / total_count) * 100.0, 2) if total_count else 0.0,
                "throughput_ops_sec": round(success_count / total_duration, 2) if total_duration else 0.0,
                "latency_ms": {
                    "avg": to_ms(statistics.mean(latencies)) if latencies else 0.0,
                    "p50": to_ms(percentile(latencies, 50)),
                    "p95": to_ms(percentile(latencies, 95)),
                    "p99": to_ms(percentile(latencies, 99)),
                    "max": to_ms(max(latencies)) if latencies else 0.0,
                },
            },
            "per_operation": {
                name: {
                    "count": len(values),
                    "avg_ms": to_ms(statistics.mean(values)) if values else 0.0,
                    "p95_ms": to_ms(percentile(values, 95)),
                    "max_ms": to_ms(max(values)) if values else 0.0,
                }
                for name, values in per_op.items()
            },
            "errors_sample": errors[:20],
        }

        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        html_path.parent.mkdir(parents=True, exist_ok=True)
        html_path.write_text(self._build_html(report), encoding="utf-8")

        cleanup_deleted = self._cleanup_old_outputs(
            html_path=html_path,
            json_path=json_path,
            max_age_minutes=cleanup_age_minutes,
        )

        self.stdout.write(self.style.SUCCESS("Stress test concluido."))
        self.stdout.write(f"HTML: {html_path}")
        self.stdout.write(f"JSON: {json_path}")
        self.stdout.write(
            f"Resumo: sucesso={success_count} erro={error_count} throughput={report['results']['throughput_ops_sec']} ops/s"
        )
        if cleanup_age_minutes > 0:
            self.stdout.write(f"Limpeza automatica: {cleanup_deleted} arquivo(s)/pasta(s) removidos.")
        if serve:
            self._serve_report(html_path, port=port, open_browser=open_browser)


    def _cleanup_old_outputs(self, html_path, json_path, max_age_minutes):
        if max_age_minutes <= 0:
            return 0

        now = time.time()
        max_age_seconds = max_age_minutes * 60.0
        preserved = {html_path.resolve(), json_path.resolve()}
        cleaned_count = 0

        cleanup_roots = {
            html_path.parent.resolve(),
            json_path.parent.resolve(),
        }

        for root in cleanup_roots:
            if not root.exists() or not root.is_dir():
                continue

            for path in root.glob("stress-*.html"):
                if self._should_delete_path(path, preserved, now, max_age_seconds):
                    path.unlink(missing_ok=True)
                    cleaned_count += 1

            for path in root.glob("stress-*.json"):
                if self._should_delete_path(path, preserved, now, max_age_seconds):
                    path.unlink(missing_ok=True)
                    cleaned_count += 1

            # Remove pastas temporarias (ex: tmp8piiiq5q) no mesmo diretorio de saida.
            for path in root.glob("tmp*"):
                if not path.is_dir():
                    continue
                if self._is_older_than(path, now, max_age_seconds):
                    shutil.rmtree(path, ignore_errors=True)
                    cleaned_count += 1

        return cleaned_count

    def _should_delete_path(self, path, preserved, now, max_age_seconds):
        if not path.exists() or not path.is_file():
            return False
        try:
            resolved = path.resolve()
        except OSError:
            return False
        if resolved in preserved:
            return False
        return self._is_older_than(path, now, max_age_seconds)

    def _is_older_than(self, path, now, max_age_seconds):
        try:
            age = now - path.stat().st_mtime
        except OSError:
            return False
        return age >= max_age_seconds

    def _build_html(self, report):
        report_json = json.dumps(report, ensure_ascii=False)
        return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Relatorio de Stress - Mercado</title>
  <style>
    :root {{
      --bg: #f4f7ff;
      --panel: #ffffff;
      --line: #dde6f7;
      --text: #0f2344;
      --muted: #5a6f91;
      --blue: #2f68ff;
      --blue-soft: #eaf1ff;
      --green: #1f9d63;
      --yellow: #a97400;
      --red: #b43636;
      --radius: 14px;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: radial-gradient(circle at top right, #edf3ff, var(--bg) 45%);
      color: var(--text);
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      line-height: 1.4;
    }}
    .container {{
      max-width: 1480px;
      margin: 0 auto;
      padding: 22px;
    }}
    .panel {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 14px;
      box-shadow: 0 10px 30px rgba(40, 70, 140, 0.08);
    }}
    h1 {{ margin: 0 0 8px; font-size: 44px; letter-spacing: -0.02em; }}
    h2 {{ margin: 0 0 10px; font-size: 30px; letter-spacing: -0.01em; }}
    h3 {{ margin: 0 0 8px; font-size: 20px; }}
    .muted {{ color: var(--muted); }}
    .kpis {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }}
    .kpi {{
      border: 1px solid var(--line);
      background: linear-gradient(180deg, #ffffff, #f7faff);
      border-radius: 12px;
      padding: 12px;
    }}
    .kpi .label {{ font-size: 12px; color: var(--muted); }}
    .kpi .value {{ margin-top: 6px; font-size: 34px; font-weight: 800; }}
    .kpi .sub {{ margin-top: 4px; font-size: 12px; color: var(--muted); }}
    .layout-2 {{
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 12px;
    }}
    .bars {{ display: grid; gap: 10px; }}
    .bar-row {{
      display: grid;
      grid-template-columns: 120px 1fr 80px;
      align-items: center;
      gap: 10px;
      font-size: 13px;
    }}
    .bar-track {{
      height: 12px;
      border-radius: 999px;
      background: var(--blue-soft);
      overflow: hidden;
    }}
    .bar-fill {{
      height: 100%;
      background: linear-gradient(90deg, #4b7cff, #2f68ff);
    }}
    .chip {{
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 12px;
      font-weight: 700;
      margin-right: 6px;
      margin-bottom: 6px;
      border: 1px solid transparent;
    }}
    .chip.ok {{ color: var(--green); background: #e8f8f1; border-color: #bfe9d7; }}
    .chip.warn {{ color: var(--yellow); background: #fff5df; border-color: #f3deab; }}
    .chip.bad {{ color: var(--red); background: #ffebeb; border-color: #f3c2c2; }}
    .insights {{ margin: 8px 0 0; padding-left: 18px; }}
    .insights li {{ margin: 5px 0; }}
    .table-wrap {{
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: auto;
      max-height: 560px;
      background: #fff;
    }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{
      border-bottom: 1px solid #e8effc;
      padding: 9px 10px;
      text-align: left;
      white-space: nowrap;
      font-size: 13px;
    }}
    th {{
      position: sticky;
      top: 0;
      background: #f3f7ff;
      z-index: 1;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #4d6ca1;
    }}
    .mono {{ font-family: Consolas, Menlo, monospace; font-size: 12px; }}
    @media (max-width: 1020px) {{
      .layout-2 {{ grid-template-columns: 1fr; }}
      h1 {{ font-size: 34px; }}
      h2 {{ font-size: 24px; }}
    }}
  </style>
</head>
<body>
  <div class="container">
    <section class="panel">
      <h1>Relatorio de Stress do Banco</h1>
      <p class="muted">
        Execucao: <strong>{report['timestamp']}</strong> |
        Configuracao: <strong>{report['settings']['threads']} threads</strong> x
        <strong>{report['settings']['ops_per_thread']} ops</strong> (read_ratio=<strong>{report['settings']['read_ratio']}</strong>)
      </p>
      <div id="summary" class="kpis"></div>
    </section>

    <section class="panel layout-2">
      <div>
        <h2>Diagnostico</h2>
        <div id="health-chips"></div>
        <ul id="insights" class="insights"></ul>
      </div>
      <div>
        <h2>Distribuicao de latencia</h2>
        <div id="latency-bars" class="bars"></div>
      </div>
    </section>

    <section class="panel">
      <h2>Operacoes (detalhado)</h2>
      <div class="table-wrap">
        <table id="ops-table">
          <thead>
            <tr>
              <th>Operacao</th>
              <th>Count</th>
              <th>% do total</th>
              <th>Media (ms)</th>
              <th>P95 (ms)</th>
              <th>Max (ms)</th>
              <th>Risco P95</th>
              <th>Peso p/ gargalo</th>
              <th>Visual P95</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h2>Erros (amostra)</h2>
      <div id="errors"></div>
    </section>
  </div>

  <script>
    const report = {report_json};
    const totalTarget = report.settings.target_operations || 0;
    const totalSuccess = report.results.success_count || 0;
    const totalErrors = report.results.error_count || 0;
    const latency = report.results.latency_ms || {{}};
    const durationSec = Number(report.results.total_duration_seconds || 0);
    const durationMin = durationSec / 60;
    const durationMM = Math.floor(durationSec / 60);
    const durationSS = Math.round(durationSec % 60).toString().padStart(2, "0");

    const summary = [
      ["Threads", report.settings.threads, "Concorrencia do teste"],
      ["Ops alvo", totalTarget, "threads x ops/thread"],
      ["Sucesso", totalSuccess, "Operacoes concluidas"],
      ["Erros", totalErrors, "Falhas registradas"],
      ["Taxa de erro (%)", report.results.error_rate_pct, "Quanto menor melhor"],
      ["Throughput (ops/s)", report.results.throughput_ops_sec, "Capacidade efetiva"],
      ["Lat media (ms)", latency.avg, "Tempo medio"],
      ["P95 (ms)", latency.p95, "95% das ops <= este tempo"],
      ["P99 (ms)", latency.p99, "99% das ops <= este tempo"],
      ["Max (ms)", latency.max, "Pior caso observado"],
      ["Duracao (s)", report.results.total_duration_seconds, "Tempo total do teste"],
      ["Duracao (min)", durationMin.toFixed(2), `Aprox. ${{durationMM}}:${{durationSS}}`],
      ["Tentativas", report.settings.retries, "Retry para lock transiente"],
    ];
    const summaryNode = document.getElementById("summary");
    summary.forEach(([label, value, sub]) => {{
      const card = document.createElement("div");
      card.className = "kpi";
      card.innerHTML = `
        <div class="label">${{label}}</div>
        <div class="value">${{value}}</div>
        <div class="sub">${{sub}}</div>
      `;
      summaryNode.appendChild(card);
    }});

    const opRows = Object.entries(report.per_operation || {{}});
    const maxP95 = Math.max(...opRows.map(([, v]) => Number(v.p95_ms || 0)), 1);
    const tbody = document.querySelector("#ops-table tbody");
    const health = document.getElementById("health-chips");
    const insights = document.getElementById("insights");

    const p95Risk = (value) => {{
      if (value <= 30) return "ok";
      if (value <= 80) return "warn";
      return "bad";
    }};

    const riskLabel = (risk) => {{
      if (risk === "ok") return "Baixo";
      if (risk === "warn") return "Moderado";
      return "Alto";
    }};

    const opEnriched = opRows.map(([name, data]) => {{
      const count = Number(data.count || 0);
      const share = totalSuccess ? (count / totalSuccess) * 100 : 0;
      const p95 = Number(data.p95_ms || 0);
      const avg = Number(data.avg_ms || 0);
      const max = Number(data.max_ms || 0);
      const bottleneckWeight = p95 * count;
      return {{ name, count, share, p95, avg, max, bottleneckWeight, risk: p95Risk(p95) }};
    }}).sort((a, b) => b.bottleneckWeight - a.bottleneckWeight);

    opEnriched.forEach((row) => {{
      const width = Math.max(2, Math.round((row.p95 / maxP95) * 100));
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${{row.name}}</strong></td>
        <td>${{row.count}}</td>
        <td>${{row.share.toFixed(2)}}%</td>
        <td>${{row.avg.toFixed(2)}}</td>
        <td>${{row.p95.toFixed(2)}}</td>
        <td>${{row.max.toFixed(2)}}</td>
        <td>${{riskLabel(row.risk)}}</td>
        <td>${{Math.round(row.bottleneckWeight).toLocaleString("pt-BR")}}</td>
        <td><div class="bar-track"><div class="bar-fill" style="width:${{width}}%"></div></div></td>
      `;
      tbody.appendChild(tr);
    }});

    const sumPerOp = opEnriched.reduce((acc, item) => acc + item.count, 0);
    const consistencyOk = sumPerOp === totalSuccess;
    const errorRate = Number(report.results.error_rate_pct || 0);
    const topBottleneck = opEnriched[0];

    const chips = [
      {{
        label: consistencyOk ? "Consistencia ok" : "Consistencia divergente",
        cls: consistencyOk ? "ok" : "bad",
      }},
      {{
        label: errorRate === 0 ? "Sem erros" : `Erros: ${{errorRate}}%`,
        cls: errorRate === 0 ? "ok" : (errorRate < 1 ? "warn" : "bad"),
      }},
      {{
        label: latency.p95 <= 60 ? `P95 controlado (${{latency.p95}}ms)` : `P95 alto (${{latency.p95}}ms)`,
        cls: latency.p95 <= 60 ? "ok" : (latency.p95 <= 90 ? "warn" : "bad"),
      }},
      {{
        label: topBottleneck ? `Principal gargalo: ${{topBottleneck.name}}` : "Sem dados de operacao",
        cls: topBottleneck ? (topBottleneck.risk === "bad" ? "bad" : "warn") : "warn",
      }},
    ];
    chips.forEach((item) => {{
      const chip = document.createElement("span");
      chip.className = `chip ${{item.cls}}`;
      chip.textContent = item.label;
      health.appendChild(chip);
    }});

    const insightLines = [];
    insightLines.push(`Soma dos counts por operacao: ${{sumPerOp}} (sucesso total: ${{totalSuccess}}).`);
    insightLines.push(`Read ratio configurado: ${{(Number(report.settings.read_ratio || 0) * 100).toFixed(0)}}% (escrita: ${{(100 - (Number(report.settings.read_ratio || 0) * 100)).toFixed(0)}}%).`);
    if (topBottleneck) {{
      insightLines.push(`Operacao com maior peso de gargalo (p95 x volume): ${{topBottleneck.name}}.`);
    }}
    if (latency.p99 && latency.p95) {{
      const tailFactor = latency.p95 ? (latency.p99 / latency.p95) : 0;
      insightLines.push(`Fator de cauda (p99/p95): ${{tailFactor.toFixed(2)}} (quanto mais perto de 1, mais estavel).`);
    }}
    if (errorRate > 0) {{
      insightLines.push(`Ha erros na execucao. Revise a secao de erros para identificar lock/timeout.`);
    }} else {{
      insightLines.push("Nao houve erros de execucao na amostra.");
    }}
    insightLines.forEach((line) => {{
      const li = document.createElement("li");
      li.textContent = line;
      insights.appendChild(li);
    }});

    const latencyBars = document.getElementById("latency-bars");
    const latencySeries = [
      ["Media", Number(latency.avg || 0)],
      ["P50", Number(latency.p50 || 0)],
      ["P95", Number(latency.p95 || 0)],
      ["P99", Number(latency.p99 || 0)],
      ["Max", Number(latency.max || 0)],
    ];
    const latencyMax = Math.max(...latencySeries.map(([, value]) => value), 1);
    latencySeries.forEach(([label, value]) => {{
      const width = Math.max(2, Math.round((value / latencyMax) * 100));
      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML = `
        <strong>${{label}}</strong>
        <div class="bar-track"><div class="bar-fill" style="width:${{width}}%"></div></div>
        <span class="mono">${{value.toFixed(2)}} ms</span>
      `;
      latencyBars.appendChild(row);
    }});

    const errorsDiv = document.getElementById("errors");
    if (!report.errors_sample || !report.errors_sample.length) {{
      const p = document.createElement("p");
      p.textContent = "Sem erros na amostra.";
      errorsDiv.appendChild(p);
    }} else {{
      report.errors_sample.forEach((err) => {{
        const p = document.createElement("p");
        p.className = "mono";
        p.style.color = "#9c1f1f";
        p.textContent = err;
        errorsDiv.appendChild(p);
      }});
    }}
  </script>
</body>
</html>
"""

    def _serve_report(self, html_path, port=8787, open_browser=False):

        report_dir = html_path.parent
        relative_name = html_path.name
        handler = partial(SimpleHTTPRequestHandler, directory=str(report_dir))
        server = ThreadingHTTPServer(("127.0.0.1", port), handler)
        url = f"http://127.0.0.1:{port}/{relative_name}"
        self.stdout.write(self.style.NOTICE(f"Visualizacao: {url}"))
        self.stdout.write("Pressione Ctrl+C para encerrar o servidor local.")
        if open_browser:
            webbrowser.open(url, new=2)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            self.stdout.write("\nServidor encerrado.")
        finally:
            server.server_close()

