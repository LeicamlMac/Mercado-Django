import "./QuickEntryPanel.css";

export function QuickEntryPanel(props) {
  const {
    canWrite,
    quickEntrySectionRef,
    catalogMeta,
    barcodeQuery,
    setBarcodeQuery,
    handleCatalogBarcodeLookup,
    catalogLoading,
    catalogQuery,
    setCatalogQuery,
    handleCatalogSearch,
    smartCatalogGroups,
    catalogBatchEntries,
    applyCatalogBatchSelections,
    catalogBatchSaving,
    setCatalogBatchEntries,
    catalogUsageHistory,
    expandedCatalogGroups,
    setExpandedCatalogGroups,
    getGroupVariantOptions,
    catalogChoices,
    getGroupSizeOptions,
    updateCatalogChoice,
    selectCatalogBrand,
    addCatalogBrandSelection,
    applyCatalogBrandSelection,
    corrigirOrtografiaUI,
    formatarTamanhoUI,
  } = props;

  if (!canWrite) {
    return (
      <section className="panel quick-entry-panel">
        <p className="feedback">Modo visualização. Cadastro e reposição bloqueados.</p>
      </section>
    );
  }

  return (
    <section className="panel quick-entry-panel" ref={quickEntrySectionRef}>
      <h2>Entrada rápida (cria ou repõe automaticamente)</h2>
      <p className="hint">
        Dica: ao informar o produto (ex: Leite, Arroz, Refrigerante), o formulário
        sugere automaticamente tipo, tamanho e embalagem mais comum.
      </p>
      <div className="catalog-assistant">
        <h3>Assistente de catálogo</h3>
        <p className="hint">
          Fonte ativa: {catalogMeta.bluesoft_configurada ? "Bluesoft + local" : "Catálogo local (configure Bluesoft)"}.
          {catalogMeta.resultados_bluesoft || catalogMeta.resultados_locais || catalogMeta.resultados_estoque
            ? ` Resultados: estoque ${catalogMeta.resultados_estoque || 0}, Bluesoft ${catalogMeta.resultados_bluesoft || 0}, local ${catalogMeta.resultados_locais || 0}.`
            : ""}
        </p>
        <p className="hint">
          Para selecionar 2 ou mais marcas no mesmo lançamento, abra as marcas desejadas, adicione cada uma ao lote e depois clique em <strong>Salvar lote</strong>.
        </p>
        <div className="catalog-search-row">
          <input
            value={barcodeQuery}
            onChange={(event) => setBarcodeQuery(event.target.value)}
            placeholder="Código de barras (EAN/GTIN)"
          />
          <button type="button" onClick={handleCatalogBarcodeLookup} disabled={catalogLoading}>
            {catalogLoading ? "Buscando..." : "Buscar por código"}
          </button>
        </div>
        <div className="catalog-search-row">
          <input
            value={catalogQuery}
            onChange={(event) => setCatalogQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleCatalogSearch();
              }
            }}
            placeholder="Pesquisar produto no catálogo (ex: refrigerante cola)"
          />
          <button type="button" className="ghost" onClick={handleCatalogSearch} disabled={catalogLoading}>
            Pesquisar nome
          </button>
        </div>
        {smartCatalogGroups.length ? (
          <div className="catalog-results">
            {catalogBatchEntries.length ? (
              <article className="catalog-item full-width">
                <div>
                  <strong>Lote pronto: {catalogBatchEntries.length} item(ns)</strong>
                  <p>
                    {catalogBatchEntries
                      .slice(0, 3)
                      .map((entry) =>
                        `${corrigirOrtografiaUI(entry.product_name)} ${corrigirOrtografiaUI(entry.variant_label)} - ${corrigirOrtografiaUI(entry.brand)} - ${formatarTamanhoUI(entry.package_size)} x${entry.quantity}`
                      )
                      .join(" | ")}
                    {catalogBatchEntries.length > 3 ? " | ..." : ""}
                  </p>
                </div>
                <div className="actions">
                  <button type="button" onClick={applyCatalogBatchSelections} disabled={catalogBatchSaving}>
                    {catalogBatchSaving ? "Processando lote..." : "Salvar lote"}
                  </button>
                  <button type="button" className="ghost" onClick={() => setCatalogBatchEntries([])}>
                    Limpar lote
                  </button>
                </div>
              </article>
            ) : null}
            {smartCatalogGroups.map((group) => {
              const produtoUi = corrigirOrtografiaUI(group.product_name);
              const marcaUi = corrigirOrtografiaUI(group.brand);
              const categoriaUi = corrigirOrtografiaUI(group.category);
              const usageCount = Number(catalogUsageHistory[group.key] || 0);
              const expanded = expandedCatalogGroups.includes(group.key);
              const variantOptions = getGroupVariantOptions(group);
              const choice = catalogChoices[group.key] || {
                variant: variantOptions[0] || "Tradicional",
                size: "",
                quantity: "1",
              };
              const sizeOptions = getGroupSizeOptions(
                group,
                choice.variant || variantOptions[0] || "Tradicional"
              );
              const uniqueSizes = Array.from(new Set(sizeOptions));
              return (
                <article key={group.key} className="catalog-item">
                  <div>
                    <strong>{`${produtoUi} - ${marcaUi}`}</strong>
                    <p>
                      {categoriaUi} - fonte: {group.source} - {group.options.length} variações no estoque - {" "}
                      {variantOptions.length} tipos exibidos
                    </p>
                    {usageCount > 0 ? (
                      <p className="catalog-usage-badge">
                        Mais usado: {usageCount}x
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        if (expanded) {
                          setExpandedCatalogGroups((prev) => prev.filter((key) => key !== group.key));
                          return;
                        }
                        selectCatalogBrand(group);
                      }}
                    >
                      {expanded ? "Fechar seleção" : "Selecionar marca"}
                    </button>
                  </div>
                  {expanded ? (
                    <div className="form-grid quick-entry-options">
                      <label>
                        Tipo
                        <select
                          value={choice.variant}
                          onChange={(event) =>
                            updateCatalogChoice(
                              group.key,
                              { variant: event.target.value, size: "" },
                              variantOptions[0] || "Tradicional"
                            )
                          }
                        >
                          {variantOptions.map((name) => (
                            <option key={name} value={name}>
                              {corrigirOrtografiaUI(name)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Tamanho/Litros
                        <select
                          value={choice.size}
                          onChange={(event) =>
                            updateCatalogChoice(
                              group.key,
                              { size: event.target.value },
                              variantOptions[0] || "Tradicional"
                            )
                          }
                        >
                          <option value="">Selecione...</option>
                          {uniqueSizes.map((size) => (
                            <option key={size} value={size}>
                              {formatarTamanhoUI(size)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Quantidade
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={choice.quantity}
                          onChange={(event) =>
                            updateCatalogChoice(
                              group.key,
                              { quantity: event.target.value },
                              variantOptions[0] || "Tradicional"
                            )
                          }
                        />
                      </label>
                      <div className="actions">
                        <button type="button" className="ghost" onClick={() => addCatalogBrandSelection(group)}>
                          Adicionar ao lote
                        </button>
                        <button type="button" onClick={() => applyCatalogBrandSelection(group)}>
                          Usar no formulário
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
      <p className="hint">
        Fluxo recomendado: use o Assistente de catálogo, adicione os itens ao lote e finalize em <strong>Salvar lote</strong>.
      </p>
    </section>
  );
}
