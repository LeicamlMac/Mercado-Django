import "./MetricsSection.css";

function MetricCard({ loading, label, value }) {
  return (
    <article className={loading ? "metric-card loading" : "metric-card"}>
      <span>{label}</span>
      <strong>{loading ? "..." : value}</strong>
    </article>
  );
}

export function MetricsSection({ metricsLoading, metrics, metricsUpdatedLabel }) {
  return (
    <>
      <section className="metrics">
        <MetricCard loading={metricsLoading} label="Total de variacoes" value={metrics.total_variants} />
        <MetricCard loading={metricsLoading} label="Ativas" value={metrics.active_variants} />
        <MetricCard loading={metricsLoading} label="Estoque total" value={metrics.total_stock} />
        <MetricCard loading={metricsLoading} label="Baixo estoque" value={metrics.low_stock_count} />
      </section>
      <p className="hint inline-hint">
        Ultima atualizacao de metricas: <strong>{metricsUpdatedLabel}</strong>
      </p>
    </>
  );
}
