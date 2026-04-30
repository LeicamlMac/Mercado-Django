import "./OperationsPanel.css";

export function OperationsPanel({
  canWrite,
  operationSectionRef,
  operacaoItemSelecionado,
  operacaoContextLoading,
  operacaoLastMovement,
  saving,
  handleOperacaoEstoque,
  operacaoSearch,
  setOperacaoSearch,
  handleOperacaoSearchSubmit,
  operacaoSearching,
  operacaoForm,
  setOperacaoForm,
  operacaoItems,
  showOperacaoAdvanced,
  setShowOperacaoAdvanced,
  operacaoPackageOptions,
  movimentoLabel,
  formatDateTimePtBr,
}) {
  if (!canWrite) return null;

  return (
    <section className="panel operations-panel" ref={operationSectionRef}>
      <h2>Operação de estoque</h2>
      <p className="hint">
        Essa seção serve para movimentar estoque de um item já cadastrado: <strong>Receber</strong> (entrada), <strong>Venda</strong> (saída) e <strong>Ajuste</strong> (corrigir contagem).
      </p>
      <div className="operation-cards">
        <article className="operation-card">
          <span>Item selecionado</span>
          <strong>{operacaoItemSelecionado?.label || "Nenhum item"}</strong>
        </article>
        <article className="operation-card">
          <span>Estoque atual</span>
          <strong>{operacaoItemSelecionado ? operacaoItemSelecionado.stock : "-"}</strong>
        </article>
        <article className="operation-card">
          <span>Última movimentação</span>
          <strong>
            {operacaoContextLoading
              ? "Carregando..."
              : operacaoLastMovement
                ? `${movimentoLabel[operacaoLastMovement.movement_type] || operacaoLastMovement.movement_type} (${operacaoLastMovement.units_delta > 0 ? "+" : ""}${operacaoLastMovement.units_delta})`
                : "Sem histórico"}
          </strong>
        </article>
        <article className="operation-card">
          <span>Atualizado em</span>
          <strong>{formatDateTimePtBr(operacaoItemSelecionado?.updated_at)}</strong>
        </article>
      </div>
      {saving ? (
        <div className="inline-progress" role="status" aria-live="polite">
          <span>Registrando movimentacao...</span>
          <div className="progress-track">
            <div className="progress-fill animated" style={{ width: "100%" }} />
          </div>
        </div>
      ) : null}
      <form className="form-grid" onSubmit={handleOperacaoEstoque}>
        <label>
          Buscar item
          <div className="catalog-search-row">
            <input
              value={operacaoSearch}
              onChange={(event) => setOperacaoSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleOperacaoSearchSubmit();
                }
              }}
              placeholder="Digite produto, marca, tipo ou tamanho..."
            />
            <button
              type="button"
              className="ghost"
              onClick={handleOperacaoSearchSubmit}
              disabled={operacaoSearching}
            >
              Buscar
            </button>
          </div>
        </label>
        <label>
          Item
          <select
            value={operacaoForm.variant_id}
            onChange={(event) => setOperacaoForm((prev) => ({ ...prev, variant_id: event.target.value }))}
          >
            <option value="">Selecione...</option>
            {operacaoItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="muted operation-helper">
            {operacaoSearching
              ? "Buscando itens..."
              : operacaoSearch.trim() && !operacaoItems.length
                ? "Nenhum item encontrado para essa busca."
                : " "}
          </span>
        </label>
        <label>
          Tipo de movimentação
          <select
            value={operacaoForm.tipo}
            onChange={(event) => setOperacaoForm((prev) => ({ ...prev, tipo: event.target.value }))}
          >
            <option value="RECEIVE">Receber</option>
            <option value="SELL">Venda</option>
            <option value="ADJUST">Ajuste</option>
          </select>
        </label>
        <label>
          {operacaoForm.tipo === "ADJUST" ? "Ajuste em unidades" : "Quantidade"}
          <input
            type="number"
            min="1"
            step="1"
            value={operacaoForm.tipo === "ADJUST" ? operacaoForm.quantity_units : operacaoForm.package_quantity}
            onChange={(event) =>
              setOperacaoForm((prev) =>
                operacaoForm.tipo === "ADJUST"
                  ? { ...prev, quantity_units: event.target.value }
                  : { ...prev, package_quantity: event.target.value }
              )
            }
          />
        </label>
        <div className="actions full-width">
          <button type="button" className="ghost" onClick={() => setShowOperacaoAdvanced((prev) => !prev)}>
            {showOperacaoAdvanced ? "Ocultar detalhes avançados" : "Mostrar detalhes avançados"}
          </button>
        </div>

        {showOperacaoAdvanced ? (
          <>
            {operacaoForm.tipo !== "ADJUST" ? (
              <label>
                Embalagem
                <input
                  list="operacao-package-names"
                  value={operacaoForm.package_name}
                  onChange={(event) => setOperacaoForm((prev) => ({ ...prev, package_name: event.target.value }))}
                />
              </label>
            ) : null}
            <label>
              Observação
              <input
                value={operacaoForm.notes}
                onChange={(event) => setOperacaoForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Ex: compra semanal, venda balcão, ajuste inventário"
              />
            </label>
          </>
        ) : (
          <label className="full-width">
            Observação rápida (opcional)
            <input
              value={operacaoForm.notes}
              onChange={(event) => setOperacaoForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Ex: compra semanal, venda balcão"
            />
          </label>
        )}
        <div className="actions full-width">
          <button type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Registrar movimentação"}
          </button>
        </div>
      </form>
      <datalist id="operacao-package-names">
        {operacaoPackageOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </section>
  );
}
