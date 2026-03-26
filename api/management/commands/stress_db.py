import json
import random
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
from django.db.models import F, Sum

from api.models import ProductVariant, StockMovement


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
    help = "Executa teste de estresse no banco e gera relatório visual (HTML + JSON)."

    def add_arguments(self, parser):
        parser.add_argument("--threads", type=int, default=8, help="Número de threads concorrentes.")
        parser.add_argument(
            "--ops-per-thread",
            type=int,
            default=250,
            help="Quantidade de operações por thread.",
        )
        parser.add_argument(
            "--read-ratio",
            type=float,
            default=0.8,
            help="Proporção de leituras (0.0 a 1.0). Ex: 0.8 = 80%% leitura.",
        )
        parser.add_argument(
            "--retries",
            type=int,
            default=2,
            help="Tentativas extras em erro transiente de lock no SQLite.",
        )
        parser.add_argument(
            "--output",
            default="stress-report.html",
            help="Caminho do relatório HTML de saída.",
        )
        parser.add_argument(
            "--json-output",
            default="stress-report.json",
            help="Caminho do relatório JSON de saída.",
        )
        parser.add_argument(
            "--serve",
            action="store_true",
            help="Sobe um servidor HTTP local para visualizar o relatório no navegador.",
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

    def handle(self, *args, **options):
        threads = options["threads"]
        ops_per_thread = options["ops_per_thread"]
        read_ratio = options["read_ratio"]
        retries = options["retries"]
        html_path = Path(options["output"]).resolve()
        json_path = Path(options["json_output"]).resolve()
        serve = options["serve"]
        port = options["port"]
        open_browser = options["open_browser"]

        if threads < 1 or ops_per_thread < 1:
            raise CommandError("Use --threads >= 1 e --ops-per-thread >= 1.")
        if read_ratio < 0.0 or read_ratio > 1.0:
            raise CommandError("Use --read-ratio entre 0.0 e 1.0.")

        variant_ids = list(ProductVariant.objects.values_list("id", flat=True))
        if not variant_ids:
            raise CommandError(
                "Não há itens em ProductVariant para testar. Rode seed antes (ex: manage.py seed_products)."
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
                .prefetch_related("packages", "product__departments")
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
                    raise RuntimeError(f"Variant {variant_id} não encontrado para update.")
                StockMovement.objects.create(
                    variant_id=variant_id,
                    movement_type=StockMovement.MOVEMENT_RECEIVE,
                    package=None,
                    package_quantity=1,
                    units_delta=units,
                    notes="stress-test",
                    created_by=None,
                )

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

        self.stdout.write(self.style.SUCCESS("Stress test concluído."))
        self.stdout.write(f"HTML: {html_path}")
        self.stdout.write(f"JSON: {json_path}")
        self.stdout.write(
            f"Resumo: sucesso={success_count} erro={error_count} throughput={report['results']['throughput_ops_sec']} ops/s"
        )
        if serve:
            self._serve_report(html_path, port=port, open_browser=open_browser)

    def _build_html(self, report):
        report_json = json.dumps(report, ensure_ascii=False)
        return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Stress Report - Mercado</title>
  <style>
    body {{ font-family: Segoe UI, Arial, sans-serif; margin: 24px; background:#f6f8fc; color:#0f1b35; }}
    .grid {{ display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin:12px 0 20px; }}
    .card {{ background:#fff; border:1px solid #dfe6f5; border-radius:10px; padding:12px; }}
    .label {{ font-size:12px; color:#5470a6; }}
    .value {{ font-size:24px; font-weight:700; margin-top:4px; }}
    table {{ width:100%; border-collapse: collapse; background:#fff; border:1px solid #dfe6f5; border-radius:10px; overflow:hidden; }}
    th, td {{ border-bottom:1px solid #eef2fb; padding:10px; text-align:left; font-size:14px; }}
    th {{ background:#f1f5ff; }}
    .bar-wrap {{ background:#eef3ff; height:10px; border-radius:999px; overflow:hidden; }}
    .bar {{ height:10px; background:#2f68ff; }}
    .error {{ color:#9c1f1f; font-family: Consolas, monospace; font-size:12px; }}
  </style>
</head>
<body>
  <h1>Relatório de Stress do Banco</h1>
  <p>Execução: <strong>{report['timestamp']}</strong></p>
  <div id="summary" class="grid"></div>
  <h2>Operações</h2>
  <table id="ops-table">
    <thead>
      <tr>
        <th>Operação</th>
        <th>Count</th>
        <th>Média (ms)</th>
        <th>P95 (ms)</th>
        <th>Máx (ms)</th>
        <th>Visual</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>
  <h2>Erros (amostra)</h2>
  <div id="errors"></div>
  <script>
    const report = {report_json};
    const summary = [
      ["Threads", report.settings.threads],
      ["Ops alvo", report.settings.target_operations],
      ["Sucesso", report.results.success_count],
      ["Erros", report.results.error_count],
      ["Throughput (ops/s)", report.results.throughput_ops_sec],
      ["P95 (ms)", report.results.latency_ms.p95],
      ["P99 (ms)", report.results.latency_ms.p99],
      ["Duração (s)", report.results.total_duration_seconds],
    ];
    const summaryNode = document.getElementById("summary");
    summary.forEach(([label, value]) => {{
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<div class="label">${{label}}</div><div class="value">${{value}}</div>`;
      summaryNode.appendChild(card);
    }});

    const rows = Object.entries(report.per_operation);
    const maxP95 = Math.max(...rows.map(([, v]) => v.p95_ms), 1);
    const tbody = document.querySelector("#ops-table tbody");
    rows.forEach(([name, data]) => {{
      const width = Math.max(2, Math.round((data.p95_ms / maxP95) * 100));
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${{name}}</td>
        <td>${{data.count}}</td>
        <td>${{data.avg_ms}}</td>
        <td>${{data.p95_ms}}</td>
        <td>${{data.max_ms}}</td>
        <td><div class="bar-wrap"><div class="bar" style="width:${{width}}%"></div></div></td>
      `;
      tbody.appendChild(tr);
    }});

    const errorsDiv = document.getElementById("errors");
    if (!report.errors_sample.length) {{
      errorsDiv.textContent = "Sem erros na amostra.";
    }} else {{
      report.errors_sample.forEach((err) => {{
        const p = document.createElement("p");
        p.className = "error";
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
        self.stdout.write(self.style.NOTICE(f"Visualização: {url}"))
        self.stdout.write("Pressione Ctrl+C para encerrar o servidor local.")
        if open_browser:
            webbrowser.open(url, new=2)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            self.stdout.write("\nServidor encerrado.")
        finally:
            server.server_close()
