import "./SeasonalCampaignsSection.css";

export function SeasonalCampaignsSection({
  currentMonthLabel,
  seasonalCampaigns,
  activeSeasonalCampaignId,
  applySeasonalFilter,
  corrigirOrtografiaUI,
}) {
  return (
    <section className="panel seasonal-panel">
      <div className="toolbar">
        <h2>Sazonais e festividades</h2>
        <span className="muted">Mês atual: {currentMonthLabel}</span>
      </div>
      <p className="hint">
        Clique em uma campanha para preencher a busca com os itens da época e ajustar seu mix rapidamente.
      </p>
      <div className="seasonal-grid">
        {seasonalCampaigns.map((campaign) => (
          <article
            key={campaign.id}
            className={
              campaign.id === activeSeasonalCampaignId
                ? "seasonal-card selecionado"
                : campaign.activeNow
                  ? "seasonal-card ativo"
                  : "seasonal-card"
            }
          >
            <strong>{campaign.name}</strong>
            <p>{campaign.description}</p>
            <div className="seasonal-keywords">
              {campaign.keywords.slice(0, 5).map((keyword) => (
                <span key={`${campaign.id}-${keyword}`} className="catalog-usage-badge">
                  {corrigirOrtografiaUI(keyword)}
                </span>
              ))}
            </div>
            <div className="actions">
              <button
                type="button"
                className="ghost"
                onClick={() => applySeasonalFilter(campaign)}
              >
                {campaign.id === activeSeasonalCampaignId ? "Campanha aplicada" : "Filtrar campanha"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
