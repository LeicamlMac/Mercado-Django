import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  DEFAULT_ORDERING,
  DEFAULT_VARIANT_LABEL,
  EMPTY_CATALOG_META,
  EMPTY_OPERACAO_FORM as emptyOperacaoForm,
  EMPTY_QUICK_FORM as emptyQuickForm,
  FEIJAO_PRODUCT_TOKEN,
  FEIJAO_VARIANT_PRETO,
  MOVIMENTO_ENDPOINTS,
  MOVIMENTO_LABEL as movimentoLabel,
  MOVIMENTO_LIMIT_OPTIONS,
  ORDERING_OPTIONS,
  SETORES_PADRAO,
  STATUS_FILTER_OPTIONS,
  THEME_STORAGE_KEY,
  compareNormalizedPtBr,
  corrigirOrtografiaUI,
  formatCurrency,
  formatDateTimePtBr,
  formatarTamanhoUI,
  limparTipoArroz,
  loadCatalogUsageHistory,
  loadStoredTheme,
  loadStoredTokens,
  normalizarTexto,
  parseApiErrorMessage,
  regraCombinaProduto,
  regraPossuiProduto,
  requestJson,
  saveCatalogUsageHistory,
  saveStoredTokens,
  tamanhoOrdenacao,
  uniqueNonEmpty,
} from "./catalogUtils";
import {
  buildSeasonalCampaigns,
  getCurrentMonthLabel,
} from "./seasonalCampaigns";

function ThemeToggleButton({ theme, onToggle }) {
  return (
    <button type="button" className="theme-toggle" onClick={onToggle}>
      {theme === "dark" ? "Claro" : "Escuro"}
    </button>
  );
}
function App() {
  const [theme, setTheme] = useState(() => loadStoredTheme());
  const [tokens, setTokens] = useState(() => loadStoredTokens());
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginLoading, setLoginLoading] = useState(false);

  const [items, setItems] = useState([]);
  const [metrics, setMetrics] = useState({
    total_variants: 0,
    active_variants: 0,
    total_stock: 0,
    low_stock_count: 0,
  });
  const [presets, setPresets] = useState({
    departments: [],
    categories: [],
    products: [],
    brands: [],
    variant_labels: [],
    package_sizes: ["1KG", "2KG", "5KG"],
    package_names: ["UNIDADE", "FARDO", "CAIXA"],
    product_rules: [],
  });

  const [quickForm, setQuickForm] = useState(emptyQuickForm);
  const [setorAtivoId, setSetorAtivoId] = useState("all");
  const [setores, setSetores] = useState([]);
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [activeSeasonalCampaignId, setActiveSeasonalCampaignId] = useState("");
  const [activeSeasonalTerms, setActiveSeasonalTerms] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [ordering, setOrdering] = useState(DEFAULT_ORDERING);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restockQty, setRestockQty] = useState({});
  const [restockPackage, setRestockPackage] = useState({});
  const [operacaoForm, setOperacaoForm] = useState(emptyOperacaoForm);
  const [operacaoItems, setOperacaoItems] = useState([]);
  const [operacaoSearch, setOperacaoSearch] = useState("");
  const [operacaoSearching, setOperacaoSearching] = useState(false);
  const [operacaoContextLoading, setOperacaoContextLoading] = useState(false);
  const [operacaoLastMovement, setOperacaoLastMovement] = useState(null);
  const [showOperacaoAdvanced, setShowOperacaoAdvanced] = useState(false);
  const [movimentos, setMovimentos] = useState([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [barcodeQuery, setBarcodeQuery] = useState("");
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogMeta, setCatalogMeta] = useState(EMPTY_CATALOG_META);
  const [catalogChoices, setCatalogChoices] = useState({});
  const [expandedCatalogGroups, setExpandedCatalogGroups] = useState([]);
  const [catalogBatchEntries, setCatalogBatchEntries] = useState([]);
  const [catalogBatchSaving, setCatalogBatchSaving] = useState(false);
  const [movimentosLimit, setMovimentosLimit] = useState("12");
  const [catalogUsageHistory, setCatalogUsageHistory] = useState(() =>
    loadCatalogUsageHistory()
  );
  const currentMonth = useMemo(() => new Date().getMonth() + 1, []);
  const currentMonthLabel = useMemo(() => getCurrentMonthLabel(), []);
  const seasonalCampaigns = useMemo(
    () => buildSeasonalCampaigns(currentMonth),
    [currentMonth]
  );
  const activeSeasonalCampaign = useMemo(
    () => seasonalCampaigns.find((campaign) => campaign.id === activeSeasonalCampaignId) || null,
    [seasonalCampaigns, activeSeasonalCampaignId]
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore localStorage errors
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const resetCatalogAssistant = useCallback(() => {
    setCatalogQuery("");
    setCatalogItems([]);
    setCatalogMeta(EMPTY_CATALOG_META);
  }, []);

  const handleSetorTodos = useCallback(() => {
    setPage(1);
    setSetorAtivoId("all");
    resetCatalogAssistant();
    setQuickForm((prev) => ({
      ...prev,
      department_names: [],
      category_name: "",
      product_name: "",
      brand: "",
      variant_label: "",
    }));
  }, [resetCatalogAssistant]);

  const handleSetorSelect = useCallback(
    (setorId) => {
      setPage(1);
      setSetorAtivoId(String(setorId));
      resetCatalogAssistant();
    },
    [resetCatalogAssistant]
  );

  const applySeasonalFilter = useCallback((campaign) => {
    const terms = (campaign?.keywords || []).filter(Boolean);
    const term = terms[0] || "";
    if (!term) return;
    setPage(1);
    setSetorAtivoId("all");
    setActiveSeasonalCampaignId(campaign.id);
    setActiveSeasonalTerms(terms);
    setSearch(term);
    setSearchApplied(term);
  }, []);

  const deactivateSeasonalFilter = useCallback(() => {
    setActiveSeasonalCampaignId("");
    setActiveSeasonalTerms([]);
  }, []);

  const applySeasonalTerm = useCallback((term) => {
    const cleaned = String(term || "").trim();
    if (!cleaned) return;
    setPage(1);
    setSearch(cleaned);
    setSearchApplied(cleaned);
  }, []);

  const clearSeasonalFilter = useCallback(() => {
    setPage(1);
    deactivateSeasonalFilter();
    setSearch("");
    setSearchApplied("");
  }, [deactivateSeasonalFilter]);

  const regraProdutoAtual = useMemo(() => {
    const nomeProduto = normalizarTexto(quickForm.product_name);
    const setorAtivoNome =
      setorAtivoId === "all"
        ? ""
        : normalizarTexto(setores.find((s) => String(s.id) === String(setorAtivoId))?.name);
    const setoresSelecionados = (quickForm.department_names || []).map(normalizarTexto);

    const regras = presets.product_rules || [];
    const porProduto = regras.filter((regra) => regraCombinaProduto(regra, nomeProduto));
    if (porProduto.length) {
      if (setorAtivoNome) {
        const porSetorAtivo = porProduto.find((regra) =>
          (regra.departments || []).map(normalizarTexto).includes(setorAtivoNome)
        );
        if (porSetorAtivo) return porSetorAtivo;
      }

      const porSetorSelecionado = porProduto.find((regra) =>
        (regra.departments || [])
          .map(normalizarTexto)
          .some((dep) => setoresSelecionados.includes(dep))
      );
      return porSetorSelecionado || porProduto[0];
    }

    const regrasGenericas = regras.filter((regra) => !regraPossuiProduto(regra));
    if (setorAtivoNome) {
      const regraSetorAtivo = regrasGenericas.find((regra) =>
        (regra.departments || []).map(normalizarTexto).includes(setorAtivoNome)
      );
      if (regraSetorAtivo) return regraSetorAtivo;
    }

    const regraSetorSelecionado = regrasGenericas.find((regra) =>
      (regra.departments || [])
        .map(normalizarTexto)
        .some((dep) => setoresSelecionados.includes(dep))
    );
    return regraSetorSelecionado || null;
  }, [
    quickForm.product_name,
    quickForm.department_names,
    presets.product_rules,
    setorAtivoId,
    setores,
  ]);

  const catalogBrandGroups = useMemo(() => {
    const groups = new Map();
    const seen = new Set();

    for (const item of catalogItems || []) {
      const cleanedVariant = limparTipoArroz(item?.product_name, item?.variant_label) || "Tradicional";
      const normalizedProduct = normalizarTexto(item?.product_name);
      const normalizedBrand = normalizarTexto(item?.brand);
      const normalizedVariant = normalizarTexto(cleanedVariant);
      const normalizedSize = normalizarTexto(item?.package_size);
      const dedupKey = `${normalizedProduct}|${normalizedBrand}|${normalizedVariant}|${normalizedSize}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const groupKey = `${normalizedProduct}|${normalizedBrand}`;
      const option = {
        ...item,
        variant_label: cleanedVariant,
      };
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          product_name: item?.product_name || "",
          brand: item?.brand || "",
          category: item?.category || "",
          source: item?.source || "",
          options: [option],
        });
      } else {
        groups.get(groupKey).options.push(option);
      }
    }

    const list = Array.from(groups.values()).map((group) => {
      group.options.sort((a, b) => {
        const av = normalizarTexto(a.variant_label);
        const bv = normalizarTexto(b.variant_label);
        if (av !== bv) return compareNormalizedPtBr(av, bv);
        const [ag, avn] = tamanhoOrdenacao(a.package_size);
        const [bg, bvn] = tamanhoOrdenacao(b.package_size);
        if (ag !== bg) return ag - bg;
        if (avn !== bvn) return avn - bvn;
        return compareNormalizedPtBr(a.package_size, b.package_size);
      });
      return group;
    });

    list.sort((a, b) => {
      const ap = normalizarTexto(a.product_name);
      const bp = normalizarTexto(b.product_name);
      if (ap !== bp) return compareNormalizedPtBr(ap, bp);
      return compareNormalizedPtBr(a.brand, b.brand);
    });
    return list;
  }, [catalogItems]);

  const smartCatalogGroups = useMemo(() => {
    const baseList = [...catalogBrandGroups];
    const rawTerm = (catalogQuery || quickForm.product_name || "").trim();
    const normalizedTerm = normalizarTexto(rawTerm);

    function scoreGroup(group) {
      const product = normalizarTexto(group.product_name);
      const brand = normalizarTexto(group.brand);
      const variants = (group.options || [])
        .map((entry) => normalizarTexto(entry.variant_label || DEFAULT_VARIANT_LABEL))
        .join(" ");
      const haystack = `${product} ${brand} ${variants}`.trim();
      const usageScore = Number(catalogUsageHistory[group.key] || 0);
      let relevanceScore = 0;

      if (normalizedTerm) {
        if (product === normalizedTerm || brand === normalizedTerm) relevanceScore += 120;
        if (product.startsWith(normalizedTerm)) relevanceScore += 80;
        if (brand.startsWith(normalizedTerm)) relevanceScore += 65;
        if (variants.includes(normalizedTerm)) relevanceScore += 55;
        if (haystack.includes(normalizedTerm)) relevanceScore += 40;
      }

      return relevanceScore + usageScore * 10;
    }

    const filtered = normalizedTerm
      ? baseList.filter((group) => {
          const product = normalizarTexto(group.product_name);
          const brand = normalizarTexto(group.brand);
          const variants = (group.options || []).some((entry) =>
            normalizarTexto(entry.variant_label || DEFAULT_VARIANT_LABEL).includes(normalizedTerm)
          );
          return (
            product.includes(normalizedTerm) ||
            brand.includes(normalizedTerm) ||
            variants
          );
        })
      : baseList;

    filtered.sort((a, b) => {
      const scoreDiff = scoreGroup(b) - scoreGroup(a);
      if (scoreDiff !== 0) return scoreDiff;
      const productDiff = compareNormalizedPtBr(a.product_name, b.product_name);
      if (productDiff !== 0) return productDiff;
      return compareNormalizedPtBr(a.brand, b.brand);
    });

    return filtered;
  }, [catalogBrandGroups, catalogQuery, quickForm.product_name, catalogUsageHistory]);

  const operacaoItemSelecionado = useMemo(() => {
    const id = Number(operacaoForm.variant_id || 0);
    if (!id) return null;
    return operacaoItems.find((item) => Number(item.id) === id) || null;
  }, [operacaoForm.variant_id, operacaoItems]);

  const operacaoPackageOptions = useMemo(() => {
    const options = new Set(["UNIDADE", ...(presets.package_names || [])]);
    (operacaoItemSelecionado?.packages || []).forEach((name) => options.add(name));
    return Array.from(options);
  }, [presets.package_names, operacaoItemSelecionado]);

  const logout = useCallback(() => {
    setTokens(null);
    saveStoredTokens(null);
    setSession(null);
    setItems([]);
    setPage(1);
    setQuickForm(emptyQuickForm);
  }, []);

  const refreshAccessToken = useCallback(async () => {
    if (!tokens?.refresh) {
      logout();
      throw new Error("Sessão expirada. Entre novamente.");
    }

    const data = await requestJson("/api/auth/token/refresh/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: tokens.refresh }),
    });

    const updated = { access: data.access, refresh: tokens.refresh };
    setTokens(updated);
    saveStoredTokens(updated);
    return updated.access;
  }, [tokens, logout]);

  const apiRequest = useCallback(
    async (path, options = {}) => {
      if (!tokens?.access) {
        throw new Error("Usuário não autenticado.");
      }

      const runRequest = (accessToken) =>
        fetch(path, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            ...(options.headers || {}),
          },
        });

      let response = await runRequest(tokens.access);
      if (response.status === 401) {
        const newAccess = await refreshAccessToken();
        response = await runRequest(newAccess);
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(parseApiErrorMessage(body, "Nao foi possivel concluir a requisicao."));
      }

      return response.status === 204 ? null : body;
    },
    [tokens, refreshAccessToken]
  );

  const canWrite = useMemo(() => {
    if (!session) return false;
    return session.is_staff || (session.groups || []).includes("catalog_manager");
  }, [session]);

  const loadSession = useCallback(async () => {
    if (!tokens?.access) {
      setAuthLoading(false);
      return;
    }

    setAuthLoading(true);
    setAuthError("");
    try {
      const me = await apiRequest("/api/auth/me/");
      setSession(me);
    } catch (sessionError) {
      setAuthError(sessionError.message);
      logout();
    } finally {
      setAuthLoading(false);
    }
  }, [tokens, apiRequest, logout]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("ordering", ordering);
    if (searchApplied.trim()) params.set("search", searchApplied.trim());
    if (statusFilter !== "all") params.set("is_active", statusFilter);
    return params.toString();
  }, [page, ordering, searchApplied, statusFilter]);

  const loadItems = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest(`/api/items/?${queryString}`);
      setItems(data.results || []);
      const total = data.count || 0;
      setPageCount(Math.max(1, Math.ceil(total / 10)));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [session, apiRequest, queryString]);

  const loadMetrics = useCallback(async () => {
    if (!session) return;
    try {
      const data = await apiRequest("/api/items/metrics/");
      setMetrics(data);
    } catch {
      // Optional in UI.
    }
  }, [session, apiRequest]);

  const loadMovimentos = useCallback(async () => {
    if (!session) return;
    try {
      const pageSize = Number(movimentosLimit || 12);
      const data = await apiRequest(`/api/movements/?page=1&page_size=${pageSize}`);
      setMovimentos(data.results || []);
    } catch {
      // Optional in UI.
    }
  }, [session, apiRequest, movimentosLimit]);

  const loadOperacaoItems = useCallback(async (query = "", autoSelectFirst = false) => {
    if (!session) return;
    setOperacaoSearching(true);
    try {
      const params = new URLSearchParams();
      if ((query || "").trim()) {
        params.set("q", query.trim());
      }
      const path = params.toString()
        ? `/api/items/choices/?${params.toString()}`
        : "/api/items/choices/";
      const data = await apiRequest(path);
      const results = data.items || [];
      setOperacaoItems(results);
      if (autoSelectFirst && results.length) {
        setOperacaoForm((prev) => ({ ...prev, variant_id: String(results[0].id) }));
      }
    } catch {
      // Optional in UI.
    } finally {
      setOperacaoSearching(false);
    }
  }, [session, apiRequest]);

  async function handleOperacaoSearchSubmit() {
    const term = (operacaoSearch || "").trim();
    await loadOperacaoItems(term, true);
  }

  const loadOperacaoContext = useCallback(async () => {
    const variantId = Number(operacaoForm.variant_id || 0);
    if (!session || !variantId) {
      setOperacaoLastMovement(null);
      return;
    }
    setOperacaoContextLoading(true);
    try {
      const data = await apiRequest(`/api/movements/?variant_id=${variantId}&page=1&page_size=1`);
      const first = (data.results || [])[0] || null;
      setOperacaoLastMovement(first);
    } catch {
      setOperacaoLastMovement(null);
    } finally {
      setOperacaoContextLoading(false);
    }
  }, [session, apiRequest, operacaoForm.variant_id]);

  const loadPresets = useCallback(async () => {
    if (!session) return;
    try {
      const data = await apiRequest("/api/catalog/presets/");
      setPresets(data);
      setQuickForm((prev) => ({
        ...prev,
        department_names: prev.department_names.length
          ? prev.department_names
          : data.departments?.length
            ? [data.departments[0]]
            : [],
        package_size: data.package_sizes?.[0] || "1KG",
        package_name: data.package_names?.[0] || "UNIDADE",
        package_units: "1",
      }));
    } catch {
      // Optional in UI.
    }
  }, [session, apiRequest]);

  const loadSetores = useCallback(async () => {
    if (!session) return;
    try {
      const data = await apiRequest("/api/departments/");
      const recebidos = data.results || data || [];
      const normalizados = recebidos
        .filter((setor) => SETORES_PADRAO.includes(setor.name))
        .sort(
          (a, b) =>
            SETORES_PADRAO.indexOf(a.name) - SETORES_PADRAO.indexOf(b.name)
        );
      setSetores(normalizados);
    } catch {
      // Optional in UI.
    }
  }, [session, apiRequest]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    loadMetrics();
    loadPresets();
    loadMovimentos();
    loadOperacaoItems();
    loadSetores();
  }, [loadMetrics, loadPresets, loadMovimentos, loadOperacaoItems, loadSetores]);

  useEffect(() => {
    if (!operacaoSearch.trim()) return;
    if (operacaoForm.variant_id) return;
    if (!operacaoItems.length) return;
    setOperacaoForm((prev) => ({ ...prev, variant_id: String(operacaoItems[0].id) }));
  }, [operacaoSearch, operacaoItems, operacaoForm.variant_id]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearchApplied(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    loadOperacaoContext();
  }, [loadOperacaoContext]);

  useEffect(() => {
    if (setorAtivoId === "all") return;
    const setorAtivo = setores.find((s) => String(s.id) === String(setorAtivoId));
    if (!setorAtivo) return;
    setQuickForm((prev) => {
      const mesmoSetor =
        prev.department_names.length === 1 &&
        prev.department_names[0] === setorAtivo.name;
      if (mesmoSetor) {
        return prev;
      }
      return {
        ...prev,
        department_names: [setorAtivo.name],
        category_name: "",
        product_name: "",
        brand: "",
        variant_label: "",
      };
    });
    setCatalogQuery("");
    setCatalogItems([]);
    setCatalogMeta(EMPTY_CATALOG_META);
  }, [setorAtivoId, setores]);

  useEffect(() => {
    if (!regraProdutoAtual) return;

    setQuickForm((prev) => {
      const produtoPreenchido = normalizarTexto(prev.product_name).length > 0;
      const departamentosDaRegra = (regraProdutoAtual.departments || []).filter(Boolean);
      const departamentosAtualizados =
        produtoPreenchido && departamentosDaRegra.length
          ? departamentosDaRegra
          : prev.department_names;

      const proximoTipo =
        regraProdutoAtual.types?.includes(prev.variant_label) && prev.variant_label
          ? prev.variant_label
          : regraProdutoAtual.types?.[0] || prev.variant_label;

      const proximoTamanho =
        regraProdutoAtual.sizes?.includes(prev.package_size) && prev.package_size
          ? prev.package_size
          : regraProdutoAtual.sizes?.[0] || prev.package_size;

      const proximaEmbalagem =
        regraProdutoAtual.default_package_name || prev.package_name;
      const proximasUnidades =
        String(regraProdutoAtual.default_package_units || prev.package_units || "1");

      return {
        ...prev,
        department_names: departamentosAtualizados,
        variant_label: proximoTipo,
        package_size: proximoTamanho,
        package_name: proximaEmbalagem,
        package_units: proximasUnidades,
      };
    });
  }, [regraProdutoAtual]);

  const searchCatalogByTerm = useCallback(
    async (term) => {
      const query = (term || "").trim();
      if (query.length < 2) {
        setCatalogItems([]);
        setCatalogMeta(EMPTY_CATALOG_META);
        return;
      }
      try {
        const params = new URLSearchParams({ q: query });
        if (setorAtivoId !== "all") {
          const setorAtivo = setores.find((s) => String(s.id) === String(setorAtivoId));
          if (setorAtivo?.name) {
            params.set("department", setorAtivo.name);
          }
        }
        const data = await apiRequest(`/api/catalog/lookup/?${params.toString()}`);
        setCatalogItems(data.items || []);
        setCatalogMeta(data.meta || EMPTY_CATALOG_META);
      } catch {
        setCatalogItems([]);
        setCatalogMeta(EMPTY_CATALOG_META);
      }
    },
    [apiRequest, setorAtivoId, setores]
  );

  useEffect(() => {
    const term = (quickForm.product_name || "").trim();
    if (term.length < 2) return;
    const timer = setTimeout(() => {
      searchCatalogByTerm(term);
    }, 350);
    return () => clearTimeout(timer);
  }, [quickForm.product_name, searchCatalogByTerm]);

  useEffect(() => {
    const term = (catalogQuery || "").trim();
    if (term.length < 2) {
      setCatalogItems([]);
      setCatalogMeta(EMPTY_CATALOG_META);
      return;
    }
    const timer = setTimeout(() => {
      searchCatalogByTerm(term);
    }, 300);
    return () => clearTimeout(timer);
  }, [catalogQuery, searchCatalogByTerm]);

  async function handleLogin(event) {
    event.preventDefault();
    setAuthError("");
    setLoginLoading(true);
    try {
      const data = await requestJson("/api/auth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const nextTokens = { access: data.access, refresh: data.refresh };
      setTokens(nextTokens);
      saveStoredTokens(nextTokens);
      setLoginForm({ username: "", password: "" });
    } catch (loginError) {
      setAuthError(loginError.message);
    } finally {
      setLoginLoading(false);
    }
  }

  function applyCatalogItem(item) {
    if (!item) return;
    const variantLabel = limparTipoArroz(item.product_name, item.variant_label);
    setQuickForm((prev) => ({
      ...prev,
      department_names: item.department_names?.length
        ? item.department_names
        : prev.department_names,
      category_name: item.category || prev.category_name,
      product_name: item.product_name || prev.product_name,
      brand: item.brand || prev.brand,
      variant_label: variantLabel || prev.variant_label,
      package_size: item.package_size || prev.package_size,
      package_name: item.package_name || prev.package_name,
      package_units: String(item.package_units || prev.package_units || "1"),
    }));
    registerCatalogUsage(item);
    setToast("Produto aplicado ao formulário.");
  }

  const sortByNormalizedText = useCallback(
    (values) =>
      uniqueNonEmpty(values).sort((a, b) => compareNormalizedPtBr(a, b)),
    []
  );

  const sortPackageSizes = useCallback(
    (values) =>
      uniqueNonEmpty(values).sort((a, b) => {
        const [ag, av] = tamanhoOrdenacao(a);
        const [bg, bv] = tamanhoOrdenacao(b);
        if (ag !== bg) return ag - bg;
        if (av !== bv) return av - bv;
        return compareNormalizedPtBr(a, b);
      }),
    []
  );

  const getRulesForGroupProduct = useCallback(
    (group) =>
      (presets.product_rules || []).filter((rule) =>
        regraCombinaProduto(rule, normalizarTexto(group?.product_name))
      ),
    [presets.product_rules]
  );

  const registerCatalogUsage = useCallback((item) => {
    const product = normalizarTexto(item?.product_name);
    const brand = normalizarTexto(item?.brand);
    if (!product && !brand) return;
    const key = `${product}|${brand}`;
    setCatalogUsageHistory((prev) => {
      const next = {
        ...prev,
        [key]: Number(prev?.[key] || 0) + 1,
      };
      saveCatalogUsageHistory(next);
      return next;
    });
  }, []);

  const getRuleForProductName = useCallback(
    (productName) => {
      const normalized = normalizarTexto(productName);
      if (!normalized) return null;
      const rules = presets.product_rules || [];
      const productRules = rules.filter((rule) => regraCombinaProduto(rule, normalized));
      return productRules[0] || null;
    },
    [presets.product_rules]
  );

  const getItemAlerts = useCallback(
    (item) => {
      const alerts = [];

      if (Number(item?.stock || 0) < 5) {
        alerts.push({
          level: "warning",
          label: "Baixo estoque",
          suggestion: "Sugestão: repor estoque agora.",
        });
      }

      if (Number(item?.price || 0) <= 0) {
        alerts.push({
          level: "critical",
          label: "Sem preço",
          suggestion: "Sugestão: definir preço de venda.",
        });
      }

      const rule = getRuleForProductName(item?.product_name);
      const variant = (item?.variant_label || "").trim();
      const size = (item?.package_size || "").trim();
      const hasRuleTypes = (rule?.types || []).length > 0;
      const hasRuleSizes = (rule?.sizes || []).length > 0;
      const variantAllowed =
        !hasRuleTypes ||
        !variant ||
        (rule.types || []).some(
          (value) => normalizarTexto(value) === normalizarTexto(variant)
        );
      const sizeAllowed =
        !hasRuleSizes ||
        !size ||
        (rule.sizes || []).some((value) => normalizarTexto(value) === normalizarTexto(size));
      const hasInconsistentVariation = !variant || !size || !variantAllowed || !sizeAllowed;

      if (hasInconsistentVariation) {
        alerts.push({
          level: "warning",
          label: "Variação inconsistente",
          suggestion: "Sugestão: revisar tipo e tamanho do cadastro.",
        });
      }

      return alerts;
    },
    [getRuleForProductName]
  );

  function getGroupVariantOptions(group) {
    const normalizedProduct = normalizarTexto(group?.product_name);
    const catalogVariants = (group?.options || []).map(
      (entry) => entry.variant_label || DEFAULT_VARIANT_LABEL
    );
    const variants = uniqueNonEmpty(catalogVariants);
    if (!normalizedProduct.includes(FEIJAO_PRODUCT_TOKEN)) {
      return sortByNormalizedText(variants);
    }
    const ruleVariants = getRulesForGroupProduct(group).flatMap((rule) => rule.types || []);
    const hasPretoNoCatalogo = variants.some(
      (item) => normalizarTexto(item) === normalizarTexto(FEIJAO_VARIANT_PRETO)
    );
    const hasPretoNaApi = ruleVariants.some(
      (item) => normalizarTexto(item) === normalizarTexto(FEIJAO_VARIANT_PRETO)
    );
    if (!hasPretoNoCatalogo && hasPretoNaApi) {
      variants.push(FEIJAO_VARIANT_PRETO);
    }
    return sortByNormalizedText(variants);
  }

  function getGroupSizeOptions(group, variant) {
    const catalogSizes = (group?.options || [])
      .filter(
        (entry) =>
          normalizarTexto(entry.variant_label || DEFAULT_VARIANT_LABEL) ===
          normalizarTexto(variant || DEFAULT_VARIANT_LABEL)
      )
      .map((entry) => entry.package_size)
      .filter(Boolean);
    const ruleSizes = getRulesForGroupProduct(group).flatMap((rule) => rule.sizes || []);
    return sortPackageSizes([...catalogSizes, ...ruleSizes]);
  }

  function updateCatalogChoice(groupKey, updates, defaultVariant = DEFAULT_VARIANT_LABEL) {
    setCatalogChoices((prev) => {
      const current = prev[groupKey] || {};
      return {
        ...prev,
        [groupKey]: {
          variant: current.variant || defaultVariant,
          size: current.size || "",
          quantity: current.quantity || "1",
          ...current,
          ...updates,
        },
      };
    });
  }

  function selectCatalogBrand(group) {
    if (!group?.options?.length) return;
    const first = group.options[0];
    const firstVariant = first.variant_label || DEFAULT_VARIANT_LABEL;
    const sizeOptions = getGroupSizeOptions(group, firstVariant);
    const firstSize = sizeOptions[0] || first.package_size || "";
    updateCatalogChoice(group.key, {
      variant: firstVariant,
      size: firstSize,
      quantity: quickForm.quantity || "1",
    });
    setExpandedCatalogGroups((prev) =>
      prev.includes(group.key) ? prev : [...prev, group.key]
    );
  }

  function applyCatalogBrandSelection(group) {
    const resolved = resolveCatalogGroupChoice(group);
    if (!resolved) return;
    const { selected, qty } = resolved;

    applyCatalogItem(selected);
    setQuickForm((prev) => ({ ...prev, quantity: String(qty) }));
    setToast("Marca e tamanho aplicados ao formulário.");
  }

  function addCatalogBrandSelection(group) {
    const resolved = resolveCatalogGroupChoice(group);
    if (!resolved) return;
    const { selected, qty } = resolved;

    const price = Number(selected?.price || quickForm.price || 0);
    if (!price || price <= 0) {
      setError("Defina um preço no formulário para adicionar itens ao lote.");
      return;
    }

    const entry = {
      key: [
        normalizarTexto(selected?.product_name),
        normalizarTexto(selected?.brand),
        normalizarTexto(selected?.variant_label || "Tradicional"),
        normalizarTexto(selected?.package_size),
      ].join("|"),
      category_name: selected?.category || quickForm.category_name || "",
      department_names: selected?.department_names?.length
        ? selected.department_names
        : quickForm.department_names,
      product_name: selected?.product_name || "",
      brand: selected?.brand || "",
      variant_label: selected?.variant_label || "Tradicional",
      package_size: selected?.package_size || "",
      package_name: selected?.package_name || quickForm.package_name || "UNIDADE",
      package_units: Number(selected?.package_units || quickForm.package_units || 1),
      quantity: qty,
      price,
    };

    setCatalogBatchEntries((prev) => {
      const existingIndex = prev.findIndex((item) => item.key === entry.key);
      if (existingIndex === -1) return [...prev, entry];
      const updated = [...prev];
      updated[existingIndex] = entry;
      return updated;
    });
    registerCatalogUsage(selected);
    setToast("Seleção adicionada ao lote.");
  }

  function resolveCatalogGroupChoice(group) {
    if (!group?.options?.length) return null;
    const variantOptions = getGroupVariantOptions(group);
    const rawChoice = catalogChoices[group.key] || {};
    const chosenVariant = rawChoice.variant || variantOptions[0] || DEFAULT_VARIANT_LABEL;
    const sizeOptions = getGroupSizeOptions(group, chosenVariant);
    const chosenSize = rawChoice.size || sizeOptions[0] || "";
    const qty = Number(rawChoice.quantity || 1);
    if (qty < 1) {
      setError("A quantidade deve ser no mínimo 1.");
      return null;
    }
    const selectedCatalog =
      group.options.find(
        (entry) =>
          normalizarTexto(entry.variant_label || DEFAULT_VARIANT_LABEL) ===
            normalizarTexto(chosenVariant) &&
          normalizarTexto(entry.package_size) === normalizarTexto(chosenSize)
      ) ||
      group.options.find(
        (entry) =>
          normalizarTexto(entry.variant_label || DEFAULT_VARIANT_LABEL) ===
          normalizarTexto(chosenVariant)
      ) ||
      group.options[0];
    const selected = selectedCatalog
      ? {
          ...selectedCatalog,
          variant_label:
            chosenVariant || selectedCatalog.variant_label || DEFAULT_VARIANT_LABEL,
          package_size: chosenSize || selectedCatalog.package_size || "",
        }
      : null;
    return { selected, qty };
  }

  async function applyCatalogBatchSelections() {
    if (!catalogBatchEntries.length) {
      setError("Adicione pelo menos um item ao lote.");
      return;
    }
    setCatalogBatchSaving(true);
    setError("");
    let successCount = 0;
    const failedKeys = new Set();
    const failures = [];

    for (const entry of catalogBatchEntries) {
      try {
        await apiRequest("/api/items/quick-entry/", {
          method: "POST",
          body: JSON.stringify({
            ...entry,
            price: Number(entry.price),
            quantity: Number(entry.quantity),
            package_units: Number(entry.package_units || 1),
          }),
        });
        successCount += 1;
      } catch (submitError) {
        failedKeys.add(entry.key);
        failures.push(`${entry.product_name} ${entry.brand}: ${submitError.message}`);
      }
    }

    await Promise.all([loadItems(), loadMetrics(), loadPresets()]);
    setCatalogBatchSaving(false);
    if (successCount) {
      setToast(`${successCount} item(ns) do lote processado(s).`);
    }
    if (failures.length) {
      setError(`Falhas no lote (${failures.length}): ${failures.slice(0, 2).join(" | ")}`);
      setCatalogBatchEntries((prev) => prev.filter((entry) => failedKeys.has(entry.key)));
      return;
    }
    setCatalogBatchEntries([]);
  }

  async function handleCatalogBarcodeLookup() {
    const code = (barcodeQuery || "").trim();
    if (!code) {
      setError("Informe um código de barras para buscar.");
      return;
    }
    setCatalogLoading(true);
    setError("");
    try {
      const data = await apiRequest(`/api/catalog/lookup/?barcode=${encodeURIComponent(code)}`);
      const item = data.item || null;
      setCatalogItems(item ? [item] : []);
      setCatalogMeta(data.meta || {});
      if (item) {
        applyCatalogItem(item);
      } else {
        setToast("Nenhum produto encontrado para esse código.");
      }
      if (data.meta && !data.meta.bluesoft_configurada) {
        setToast("Bluesoft não configurada neste terminal. Usando catálogo local.");
      }
    } catch (lookupError) {
      setError(lookupError.message);
    } finally {
      setCatalogLoading(false);
    }
  }

  async function handleCatalogSearch() {
    const query = (catalogQuery || "").trim();
    if (query.length < 2) {
      setError("Digite ao menos 2 caracteres para pesquisar no catálogo.");
      return;
    }
    setCatalogLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ q: query });
      if (setorAtivoId !== "all") {
        const setorAtivo = setores.find((s) => String(s.id) === String(setorAtivoId));
        if (setorAtivo?.name) {
          params.set("department", setorAtivo.name);
        }
      }
      const data = await apiRequest(`/api/catalog/lookup/?${params.toString()}`);
      setCatalogItems(data.items || []);
      setCatalogMeta(data.meta || EMPTY_CATALOG_META);
      if (!(data.items || []).length) {
        setToast("Nenhum produto encontrado para essa busca.");
      }
      if (data.meta && !data.meta.bluesoft_configurada) {
        setToast("Bluesoft não configurada neste terminal. Usando catálogo local.");
      }
    } catch (lookupError) {
      setError(lookupError.message);
    } finally {
      setCatalogLoading(false);
    }
  }

  async function handleRestock(itemId) {
    const qty = Number(restockQty[itemId] || 1);
    if (qty < 1) {
      setError("A quantidade de reposição deve ser no mínimo 1.");
      return;
    }

    setError("");
    try {
      const packageName = restockPackage[itemId] || "UNIDADE";
      await apiRequest(`/api/items/${itemId}/restock/`, {
        method: "POST",
        body: JSON.stringify({ package_name: packageName, package_quantity: qty }),
      });
      setToast("Reposicao realizada com sucesso.");
      setRestockQty((prev) => ({ ...prev, [itemId]: 1 }));
      await Promise.all([loadItems(), loadMetrics()]);
    } catch (restockError) {
      setError(restockError.message);
    }
  }

  async function handleOperacaoEstoque(event) {
    event.preventDefault();
    if (!operacaoForm.variant_id) {
      setError("Selecione um item para movimentar.");
      return;
    }

    const endpoint = MOVIMENTO_ENDPOINTS[operacaoForm.tipo];
    if (!endpoint) return;

    const payload = {
      variant_id: Number(operacaoForm.variant_id),
      notes: operacaoForm.notes,
    };

    if (operacaoForm.tipo === "ADJUST") {
      payload.quantity_units = Number(operacaoForm.quantity_units || 1);
    } else {
      payload.package_name = operacaoForm.package_name;
      payload.package_quantity = Number(operacaoForm.package_quantity || 1);
    }

    setSaving(true);
    setError("");
    try {
      await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setToast("Movimentação registrada.");
      setOperacaoForm((prev) => ({ ...emptyOperacaoForm, tipo: prev.tipo }));
      await Promise.all([loadItems(), loadMetrics(), loadMovimentos()]);
    } catch (operationError) {
      setError(operationError.message);
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <>
        <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
        <main className="layout">
          <p>Validando sessão...</p>
        </main>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
        <main className="layout">
          <header className="hero">
            <p className="eyebrow">Mercado Stack</p>
            <h1>Entrar</h1>
            <p>Use um usuário cadastrado para acessar o sistema.</p>
          </header>
          <section className="panel auth-card">
            <form className="form-grid" onSubmit={handleLogin}>
              <label>
                Usuário
                <input
                  value={loginForm.username}
                  onChange={(event) =>
                    setLoginForm((prev) => ({ ...prev, username: event.target.value }))
                  }
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                  }
                />
              </label>
              <div className="actions full-width">
                <button type="submit" disabled={loginLoading}>
                  {loginLoading ? "Entrando..." : "Entrar"}
                </button>
              </div>
            </form>
            {authError ? <p className="feedback error">{authError}</p> : null}
            <p className="hint">
              Usuários de teste: <code>manager / Manager@123</code> e{" "}
              <code>viewer / Viewer@123</code>
            </p>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
      <main className="layout">
      <header className="hero topbar">
        <div>
          <p className="eyebrow">Mercado Stack</p>
          <h1>Gestao de estoque</h1>
          <p>Cadastro por categoria e movimentação por embalagem (fardo, caixa, unidade).</p>
        </div>
        <div className="session-box">
          <strong>{session.username}</strong>
          <span>{canWrite ? "Gerente de catálogo" : "Visualizador"}</span>
          <button type="button" className="ghost" onClick={logout}>
            Sair
          </button>
        </div>
      </header>

      <section className="metrics">
        <article className="metric-card">
          <span>Total de variacoes</span>
          <strong>{metrics.total_variants}</strong>
        </article>
        <article className="metric-card">
          <span>Ativas</span>
          <strong>{metrics.active_variants}</strong>
        </article>
        <article className="metric-card">
          <span>Estoque total</span>
          <strong>{metrics.total_stock}</strong>
        </article>
        <article className="metric-card">
          <span>Baixo estoque</span>
          <strong>{metrics.low_stock_count}</strong>
        </article>
      </section>

      <section className="panel">
        <h2>Setores</h2>
        <div className="tabs-setores">
          <button
            type="button"
            className={setorAtivoId === "all" ? "tab-setor ativo" : "tab-setor"}
            onClick={handleSetorTodos}
          >
            Todos
          </button>
          {setores.map((setor) => (
            <button
              key={setor.id}
              type="button"
              className={String(setor.id) === String(setorAtivoId) ? "tab-setor ativo" : "tab-setor"}
              onClick={() => handleSetorSelect(setor.id)}
            >
              {corrigirOrtografiaUI(setor.name)}
            </button>
          ))}
        </div>
      </section>

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

      {canWrite ? (
        <section className="panel">
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
                            `${corrigirOrtografiaUI(entry.product_name)} ${corrigirOrtografiaUI(entry.variant_label)} — ${corrigirOrtografiaUI(entry.brand)} — ${formatarTamanhoUI(entry.package_size)} x${entry.quantity}`
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
                  <article
                    key={group.key}
                    className="catalog-item"
                  >
                    <div>
                      <strong>
                        {`${produtoUi} — ${marcaUi}`}
                      </strong>
                      <p>
                        {categoriaUi} - fonte: {group.source} - {group.options.length} variações no estoque -{" "}
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
                      <div className="form-grid" style={{ marginTop: "0.75rem" }}>
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
      ) : (
        <section className="panel">
          <p className="feedback">Modo visualização. Cadastro e reposição bloqueados.</p>
        </section>
      )}

      {canWrite ? (
        <section className="panel">
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
              <strong>
                {formatDateTimePtBr(operacaoItemSelecionado?.updated_at)}
              </strong>
            </article>
          </div>
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
                onChange={(event) =>
                  setOperacaoForm((prev) => ({ ...prev, variant_id: event.target.value }))
                }
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
                onChange={(event) =>
                  setOperacaoForm((prev) => ({ ...prev, tipo: event.target.value }))
                }
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
                value={
                  operacaoForm.tipo === "ADJUST"
                    ? operacaoForm.quantity_units
                    : operacaoForm.package_quantity
                }
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
              <button
                type="button"
                className="ghost"
                onClick={() => setShowOperacaoAdvanced((prev) => !prev)}
              >
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
                      onChange={(event) =>
                        setOperacaoForm((prev) => ({
                          ...prev,
                          package_name: event.target.value,
                        }))
                      }
                    />
                  </label>
                ) : null}
                <label>
                  Observação
                  <input
                    value={operacaoForm.notes}
                    onChange={(event) =>
                      setOperacaoForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                    placeholder="Ex: compra semanal, venda balcão, ajuste inventário"
                  />
                </label>
              </>
            ) : (
              <label className="full-width">
                Observação rápida (opcional)
                <input
                  value={operacaoForm.notes}
                  onChange={(event) =>
                    setOperacaoForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
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
      ) : null}

      <section className="panel">
        <div className="toolbar">
          <h2>Itens cadastrados</h2>
          <div className="filters">
            <input
              placeholder="Buscar por produto, marca, tipo..."
              value={search}
              onChange={(event) => {
                if (activeSeasonalCampaignId) {
                  deactivateSeasonalFilter();
                }
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
        {activeSeasonalCampaign ? (
          <div className="seasonal-active-banner">
            <div>
              <strong>Filtro sazonal ativo: {activeSeasonalCampaign.name}</strong>
              <p>Busca atual: <strong>{searchApplied || "-"}</strong>.</p>
              <p>
                {loading
                  ? "Atualizando resultados..."
                  : items.length
                    ? `Resultados na página: ${items.length}.`
                    : "Nenhum resultado para esse termo. Tente outro termo da campanha."}
              </p>
              <div className="seasonal-term-chips">
                {activeSeasonalTerms.map((term) => (
                  <button
                    key={`season-term-${term}`}
                    type="button"
                    className={normalizarTexto(searchApplied) === normalizarTexto(term) ? "seasonal-chip ativo" : "seasonal-chip"}
                    onClick={() => applySeasonalTerm(term)}
                  >
                    {corrigirOrtografiaUI(term)}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="ghost" onClick={clearSeasonalFilter}>
              Limpar filtro sazonal
            </button>
          </div>
        ) : null}

        {loading && !items.length ? <p>Carregando itens...</p> : null}
        {!loading && !items.length ? <p>Nenhum item encontrado.</p> : null}

        {items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Setores</th>
                  <th>Produto</th>
                  <th>Marca</th>
                  <th>Tipo</th>
                  <th>Tamanho</th>
                  <th>Preco</th>
                  <th>Estoque</th>
                  <th>Alertas</th>
                  <th>Ação rápida</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const alerts = getItemAlerts(item);
                  const isCritical = alerts.some((alert) => alert.level === "critical");
                  const rowClassName = isCritical
                    ? "row-alert-critical"
                    : alerts.length
                      ? "row-alert-warning"
                      : "";
                  return (
                  <tr key={item.id} className={rowClassName}>
                    <td>{corrigirOrtografiaUI(item.category_name)}</td>
                    <td>{corrigirOrtografiaUI((item.departments || []).join(", ")) || "-"}</td>
                    <td>{corrigirOrtografiaUI(item.product_name)}</td>
                    <td>{corrigirOrtografiaUI(item.brand)}</td>
                    <td>{corrigirOrtografiaUI(item.variant_label || "Padrão")}</td>
                    <td>{formatarTamanhoUI(item.package_size)}</td>
                    <td>{formatCurrency(item.price)}</td>
                    <td>
                      <span className={item.stock < 5 ? "tag warning" : "tag good"}>
                        {item.stock}
                      </span>
                    </td>
                    <td className="alerts-cell">
                      {alerts.length ? (
                        <>
                          <div className="alerts-badges">
                            {alerts.map((alert, index) => (
                              <span
                                key={`${item.id}-alert-${index}`}
                                className={`tag ${alert.level === "critical" ? "danger" : "warning"}`}
                              >
                                {alert.label}
                              </span>
                            ))}
                          </div>
                          <p className="alert-suggestion">{alerts[0].suggestion}</p>
                        </>
                      ) : (
                        <span className="tag good">Sem alertas</span>
                      )}
                    </td>
                    <td>
                      {canWrite ? (
                        <div className="quick-restock">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={restockQty[item.id] || 1}
                            onChange={(event) =>
                              setRestockQty((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                          />
                          <select
                            value={restockPackage[item.id] || "UNIDADE"}
                            onChange={(event) =>
                              setRestockPackage((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                          >
                            {(item.packages || []).length ? (
                              item.packages.map((pack) => (
                                <option key={pack.id} value={pack.name}>
                                  {pack.name} ({pack.units_per_package} un)
                                </option>
                              ))
                            ) : (
                              <option value="UNIDADE">UNIDADE (1 un)</option>
                            )}
                          </select>
                          <button type="button" onClick={() => handleRestock(item.id)}>
                            Repor
                          </button>
                        </div>
                      ) : (
                        <span className="muted">Somente leitura</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {items.length ? (
          <div className="pager">
            <button
              type="button"
              className="ghost"
              disabled={page <= 1}
              onClick={() => setPage((prev) => prev - 1)}
            >
              Anterior
            </button>
            <span>
              Página {page} de {pageCount}
            </span>
            <button
              type="button"
              className="ghost"
              disabled={page >= pageCount}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Próxima
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="toolbar">
          <h2>Movimentacoes recentes</h2>
          <div className="filters">
            <select value={movimentosLimit} onChange={(event) => setMovimentosLimit(event.target.value)}>
              {MOVIMENTO_LIMIT_OPTIONS.map((limit) => (
                <option key={limit} value={limit}>
                  {`Últimas ${limit}`}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!movimentos.length ? <p>Sem movimentações recentes.</p> : null}
        {movimentos.length ? (
          <div className="table-wrap movements-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Item</th>
                  <th>Tipo</th>
                  <th>Variacao</th>
                  <th>Embalagem</th>
                  <th>Delta (un)</th>
                </tr>
              </thead>
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

      {error ? <p className="feedback error">{error}</p> : null}
      {toast ? <p className="feedback success">{toast}</p> : null}
      </main>
    </>
  );
}

export default App;





