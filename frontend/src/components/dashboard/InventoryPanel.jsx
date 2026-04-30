import { MOVIMENTO_LIMIT_OPTIONS, ORDERING_OPTIONS, STATUS_FILTER_OPTIONS } from "../../catalogUtils";
import "./InventoryPanel.css";

export function InventoryPanel(props) {
  const {
    inventorySectionRef,
    inventorySearchRef,
    search,
    setSearch,
    activeSeasonalCampaignId,
    deactivateSeasonalFilter,
    statusFilter,
    setStatusFilter,
    ordering,
    setOrdering,
    setorAtivoId,
    setorAtivoNome,
    inventorySummary,
    orderingLabel,
    alertFilter,
    applyAlertFilter,
    canWrite,
    inventoryAttentionList,
    handlePrepareRestock,
    activeSeasonalCampaign,
    searchApplied,
    loading,
    displayedEntries,
    activeSeasonalTerms,
    applySeasonalTerm,
    clearSeasonalFilter,
    error,
    reloadDashboardData,
    skeletonRows,
    clearInventoryFilters,
    restockQty,
    setRestockQty,
    restockPackage,
    setRestockPackage,
    handleRestock,
    page,
    pageCount,
    setPage,
    movimentosLimit,
    setMovimentosLimit,
    movimentos,
    formatDateTimePtBr,
    corrigirOrtografiaUI,
    formatarTamanhoUI,
    formatCurrency,
    movimentoLabel,
    normalizarTexto,
  } = props;

  return (
    <>
      <section className="panel inventory-panel" ref={inventorySectionRef}>
        <div className="toolbar">
          <h2>Itens cadastrados</h2>
          <div className="filters">
            <input
              ref={inventorySearchRef}
              placeholder="Buscar por produto, marca, tipo... (atalho: /)"
              value={search}
              onChange={(event) => {
                if (activeSeasonalCampaignId) deactivateSeasonalFilter();
                setSearch(event.target.value);
              }}
            />
            <select
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value);
              }}
            >
              {STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select value={ordering} onChange={(event) => setOrdering(event.target.value)}>
              {ORDERING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {setorAtivoId !== "all" ? (
          <p className="hint">
            Exibindo itens do setor <strong>{corrigirOrtografiaUI(setorAtivoNome)}</strong>.
          </p>
        ) : null}
        <div className="inventory-insights">
          <div className="inventory-summary">
            <span>{`Visiveis: ${inventorySummary.visible}/${inventorySummary.total}`}</span>
            <span>{`Criticos: ${inventorySummary.critical}`}</span>
            <span>{`Avisos: ${inventorySummary.warning}`}</span>
            <span className="ordering-chip">{`Ordenacao: ${orderingLabel}`}</span>
          </div>
          <div className="inventory-filter-chips">
            <button type="button" className={alertFilter === "all" ? "chip-action active" : "chip-action"} onClick={() => applyAlertFilter("all")}>Todos</button>
            <button type="button" className={alertFilter === "attention" ? "chip-action active" : "chip-action"} onClick={() => applyAlertFilter("attention")}>Com alerta</button>
            <button type="button" className={alertFilter === "critical" ? "chip-action active" : "chip-action"} onClick={() => applyAlertFilter("critical")}>Criticos</button>
            <button type="button" className={alertFilter === "warning" ? "chip-action active" : "chip-action"} onClick={() => applyAlertFilter("warning")}>Avisos</button>
          </div>
        </div>
        {canWrite && inventoryAttentionList.length ? (
          <div className="attention-box">
            <h3>Prioridades do turno</h3>
            <div className="attention-list">
              {inventoryAttentionList.map((entry) => (
                <article key={`attention-${entry.item.id}`} className="attention-item">
                  <div>
                    <strong>{corrigirOrtografiaUI(entry.item.product_name)}</strong>
                    <p>{corrigirOrtografiaUI(entry.item.brand || "Sem marca")} | Estoque: {entry.item.stock} | {entry.alerts.map((alert) => alert.label).join(", ")}</p>
                  </div>
                  <button type="button" className="ghost" onClick={() => handlePrepareRestock(entry.item)}>Preparar reposicao</button>
                </article>
              ))}
            </div>
          </div>
        ) : null}
        {activeSeasonalCampaign ? (
          <div className="seasonal-active-banner">
            <div>
              <strong>Filtro sazonal ativo: {activeSeasonalCampaign.name}</strong>
              <p>Busca atual: <strong>{searchApplied || "-"}</strong>.</p>
              <p>{loading ? "Atualizando resultados..." : displayedEntries.length ? `Resultados na página: ${displayedEntries.length}.` : "Nenhum resultado para esse termo. Tente outro termo da campanha."}</p>
              <div className="seasonal-term-chips">
                {activeSeasonalTerms.map((term) => (
                  <button key={`season-term-${term}`} type="button" className={normalizarTexto(searchApplied) === normalizarTexto(term) ? "seasonal-chip ativo" : "seasonal-chip"} onClick={() => applySeasonalTerm(term)}>
                    {corrigirOrtografiaUI(term)}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="ghost" onClick={clearSeasonalFilter}>Limpar filtro sazonal</button>
          </div>
        ) : null}

        {error ? (
          <div className="feedback error inline-feedback">
            <p>Nao foi possivel carregar os itens agora: {error}</p>
            <button type="button" className="ghost" onClick={reloadDashboardData}>Tentar novamente</button>
          </div>
        ) : null}

        {loading && !displayedEntries.length ? (
          <div className="table-wrap loading-state"><table><thead><tr><th>Categoria</th><th>Setores</th><th>Produto</th><th>Marca</th><th>Tipo</th><th>Tamanho</th><th>Preco</th><th>Estoque</th><th>Alertas</th><th>Acao rapida</th></tr></thead><tbody>{skeletonRows.map((row) => (<tr key={`skeleton-row-${row}`}><td colSpan={10}><div className="skeleton-line" /></td></tr>))}</tbody></table></div>
        ) : null}

        {!loading && !displayedEntries.length ? (
          <div className="empty-state">
            <h3>Nenhum item para exibir</h3>
            <p>Ajuste os filtros ou limpe a busca para visualizar o inventario completo.</p>
            <div className="actions">
              <button type="button" className="ghost" onClick={clearInventoryFilters}>Limpar filtros</button>
              <button type="button" onClick={reloadDashboardData}>Atualizar agora</button>
            </div>
          </div>
        ) : null}

        {displayedEntries.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Categoria</th><th>Setores</th><th>Produto</th><th>Marca</th><th>Tipo</th><th>Tamanho</th><th>Preco</th><th>Estoque</th><th>Alertas</th><th>Ação rápida</th></tr></thead>
              <tbody>
                {displayedEntries.map(({ item, alerts, critical }) => {
                  const rowClassName = critical ? "row-alert-critical" : alerts.length ? "row-alert-warning" : "";
                  return (
                    <tr key={item.id} className={rowClassName}>
                      <td>{corrigirOrtografiaUI(item.category_name)}</td>
                      <td>{corrigirOrtografiaUI((item.departments || []).join(", ")) || "-"}</td>
                      <td>{corrigirOrtografiaUI(item.product_name)}</td>
                      <td>{corrigirOrtografiaUI(item.brand)}</td>
                      <td>{corrigirOrtografiaUI(item.variant_label || "Padrão")}</td>
                      <td>{formatarTamanhoUI(item.package_size)}</td>
                      <td>{formatCurrency(item.price)}</td>
                      <td><span className={item.stock < 5 ? "tag warning" : "tag good"}>{item.stock}</span></td>
                      <td className="alerts-cell">
                        {alerts.length ? (
                          <>
                            <div className="alerts-badges">{alerts.map((alert, index) => (<span key={`${item.id}-alert-${index}`} className={`tag ${alert.level === "critical" ? "danger" : "warning"}`}>{alert.label}</span>))}</div>
                            <p className="alert-suggestion">{alerts[0].suggestion}</p>
                          </>
                        ) : <span className="tag good">Sem alertas</span>}
                      </td>
                      <td>
                        {canWrite ? (
                          <div className="quick-restock">
                            <input type="number" min="1" step="1" value={restockQty[item.id] || 1} onChange={(event) => setRestockQty((prev) => ({ ...prev, [item.id]: event.target.value }))} />
                            <select value={restockPackage[item.id] || "UNIDADE"} onChange={(event) => setRestockPackage((prev) => ({ ...prev, [item.id]: event.target.value }))}>
                              {(item.packages || []).length ? item.packages.map((pack) => (<option key={pack.id} value={pack.name}>{pack.name} ({pack.units_per_package} un)</option>)) : <option value="UNIDADE">UNIDADE (1 un)</option>}
                            </select>
                            <button type="button" onClick={() => handleRestock(item.id)}>Repor</button>
                          </div>
                        ) : <span className="muted">Somente leitura</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {displayedEntries.length ? (
          <div className="pager">
            <button type="button" className="ghost" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>Anterior</button>
            <span>Página {page} de {pageCount}</span>
            <button type="button" className="ghost" disabled={page >= pageCount} onClick={() => setPage((prev) => prev + 1)}>Próxima</button>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="toolbar">
          <h2>Movimentacoes recentes</h2>
          <div className="filters">
            <select value={movimentosLimit} onChange={(event) => setMovimentosLimit(event.target.value)}>
              {MOVIMENTO_LIMIT_OPTIONS.map((limit) => (
                <option key={limit} value={limit}>{`Últimas ${limit}`}</option>
              ))}
            </select>
          </div>
        </div>
        {!movimentos.length ? <p>Sem movimentações recentes.</p> : null}
        {movimentos.length ? (
          <div className="table-wrap movements-wrap">
            <table>
              <thead><tr><th>Data</th><th>Item</th><th>Tipo</th><th>Variacao</th><th>Embalagem</th><th>Delta (un)</th></tr></thead>
              <tbody>
                {movimentos.map((mov) => (
                  <tr key={mov.id}>
                    <td>{formatDateTimePtBr(mov.created_at)}</td>
                    <td>{corrigirOrtografiaUI(mov.item_name)}</td>
                    <td>{movimentoLabel[mov.movement_type] || mov.movement_type}</td>
                    <td>{corrigirOrtografiaUI(mov.variant_label || "Padrão")}</td>
                    <td>{corrigirOrtografiaUI(mov.package_name || "-")}</td>
                    <td>{mov.units_delta > 0 ? `+${mov.units_delta}` : mov.units_delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
