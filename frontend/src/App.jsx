import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { LoginView, AuthLoadingView } from "./components/auth/AuthViews";
import { DashboardHeader } from "./components/dashboard/DashboardHeader";
import { MetricsSection } from "./components/dashboard/MetricsSection";
import { SectorsSection } from "./components/dashboard/SectorsSection";
import { SeasonalCampaignsSection } from "./components/dashboard/SeasonalCampaignsSection";
import { QuickEntryPanel } from "./components/dashboard/QuickEntryPanel";
import { OperationsPanel } from "./components/dashboard/OperationsPanel";
import { InventoryPanel } from "./components/dashboard/InventoryPanel";
import { ThemeToggleButton } from "./components/ui/ThemeToggleButton";
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

const UI_ORDERING_KEY = "mercado_ui_ordering";
const UI_STATUS_FILTER_KEY = "mercado_ui_status_filter";
const UI_ALERT_FILTER_KEY = "mercado_ui_alert_filter";
const UI_MOVIMENTOS_LIMIT_KEY = "mercado_ui_movimentos_limit";

function loadUiPreference(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored || fallback;
  } catch {
    return fallback;
  }
}

function App() {
  const inventorySearchRef = useRef(null);
  const quickEntrySectionRef = useRef(null);
  const operationSectionRef = useRef(null);
  const inventorySectionRef = useRef(null);
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
  const [statusFilter, setStatusFilter] = useState(() =>
    loadUiPreference(UI_STATUS_FILTER_KEY, "all")
  );
  const [alertFilter, setAlertFilter] = useState(() =>
    loadUiPreference(UI_ALERT_FILTER_KEY, "all")
  );
  const [ordering, setOrdering] = useState(() =>
    loadUiPreference(UI_ORDERING_KEY, DEFAULT_ORDERING)
  );
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
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
  const [toast, setToast] = useState(null);
  const [metricsUpdatedAt, setMetricsUpdatedAt] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [barcodeQuery, setBarcodeQuery] = useState("");
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogMeta, setCatalogMeta] = useState(EMPTY_CATALOG_META);
  const [catalogChoices, setCatalogChoices] = useState({});
  const [expandedCatalogGroups, setExpandedCatalogGroups] = useState([]);
  const [catalogBatchEntries, setCatalogBatchEntries] = useState([]);
  const [catalogBatchSaving, setCatalogBatchSaving] = useState(false);
  const [movimentosLimit, setMovimentosLimit] = useState(() =>
    loadUiPreference(UI_MOVIMENTOS_LIMIT_KEY, "12")
  );
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

  const showToast = useCallback((message, type = "success") => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const clearInventoryFilters = useCallback(() => {
    setSearch("");
    setSearchApplied("");
    setStatusFilter("all");
    setAlertFilter("all");
    setSetorAtivoId("all");
    setPage(1);
  }, []);

  const notifyCatalogFallback = useCallback(
    (meta) => {
      if (meta && !meta.bluesoft_configurada) {
        showToast("Bluesoft nao configurada neste terminal. Usando catalogo local.", "info");
      }
    },
    [showToast]
  );

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

  const setorAtivoNome = useMemo(() => {
    if (setorAtivoId === "all") return "Todos";
    const setor = setores.find((item) => String(item.id) === String(setorAtivoId));
    return setor?.name || "Todos";
  }, [setorAtivoId, setores]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("ordering", ordering);
    if (searchApplied.trim()) params.set("search", searchApplied.trim());
    if (statusFilter !== "all") params.set("is_active", statusFilter);
    if (setorAtivoId !== "all") params.set("department_id", String(setorAtivoId));
    return params.toString();
  }, [page, ordering, searchApplied, statusFilter, setorAtivoId]);

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
    setMetricsLoading(true);
    try {
      const data = await apiRequest("/api/items/metrics/");
      setMetrics(data);
      setMetricsUpdatedAt(new Date().toISOString());
    } catch (metricsError) {
      showToast(
        metricsError?.message || "Nao foi possivel atualizar as metricas agora.",
        "warning"
      );
    } finally {
      setMetricsLoading(false);
    }
  }, [session, apiRequest, showToast]);

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

  const reloadDashboardData = useCallback(async () => {
    await Promise.all([loadItems(), loadMetrics(), loadMovimentos()]);
  }, [loadItems, loadMetrics, loadMovimentos]);

  const scrollToSection = useCallback((targetRef) => {
    targetRef?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

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
    try {
      localStorage.setItem(UI_ORDERING_KEY, ordering);
      localStorage.setItem(UI_STATUS_FILTER_KEY, statusFilter);
      localStorage.setItem(UI_ALERT_FILTER_KEY, alertFilter);
      localStorage.setItem(UI_MOVIMENTOS_LIMIT_KEY, movimentosLimit);
    } catch {
      // ignore localStorage errors
    }
  }, [ordering, statusFilter, alertFilter, movimentosLimit]);

  useEffect(() => {
    if (!toast?.id) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast?.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearchApplied(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    function onGlobalShortcut(event) {
      const targetTag = String(event.target?.tagName || "").toUpperCase();
      const typingOnField = ["INPUT", "TEXTAREA", "SELECT"].includes(targetTag);
      if (event.key === "/" && !typingOnField) {
        event.preventDefault();
        inventorySearchRef.current?.focus();
      }
      if (event.altKey && event.key === "1") {
        event.preventDefault();
        scrollToSection(quickEntrySectionRef);
      }
      if (event.altKey && event.key === "2") {
        event.preventDefault();
        scrollToSection(operationSectionRef);
      }
      if (event.altKey && event.key === "3") {
        event.preventDefault();
        scrollToSection(inventorySectionRef);
      }
      if (event.altKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        reloadDashboardData()
          .then(() => showToast("Atualizacao rapida concluida.", "success"))
          .catch(() => showToast("Nao foi possivel atualizar tudo agora.", "warning"));
      }
      if (event.key === "Escape" && document.activeElement === inventorySearchRef.current) {
        setSearch("");
        setSearchApplied("");
        inventorySearchRef.current?.blur();
      }
    }

    window.addEventListener("keydown", onGlobalShortcut);
    return () => window.removeEventListener("keydown", onGlobalShortcut);
  }, [reloadDashboardData, scrollToSection, showToast]);

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
    showToast("Produto aplicado ao formulario.", "success");
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

  const inventoryEntries = useMemo(
    () =>
      items.map((item) => {
        const alerts = getItemAlerts(item);
        const critical = alerts.some((alert) => alert.level === "critical");
        const warning = alerts.some((alert) => alert.level === "warning");
        return {
          item,
          alerts,
          critical,
          warning,
          score: (critical ? 100 : 0) + (warning ? 10 : 0) + (Number(item?.stock || 0) <= 0 ? 5 : 0),
        };
      }),
    [items, getItemAlerts]
  );

  const displayedEntries = useMemo(() => {
    if (alertFilter === "critical") {
      return inventoryEntries.filter((entry) => entry.critical);
    }
    if (alertFilter === "warning") {
      return inventoryEntries.filter((entry) => entry.warning && !entry.critical);
    }
    if (alertFilter === "attention") {
      return inventoryEntries.filter((entry) => entry.warning || entry.critical);
    }
    return inventoryEntries;
  }, [inventoryEntries, alertFilter]);

  const inventoryAttentionList = useMemo(
    () =>
      [...inventoryEntries]
        .filter((entry) => entry.warning || entry.critical)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          const aStock = Number(a.item?.stock || 0);
          const bStock = Number(b.item?.stock || 0);
          if (aStock !== bStock) return aStock - bStock;
          return compareNormalizedPtBr(a.item?.product_name, b.item?.product_name);
        })
        .slice(0, 6),
    [inventoryEntries]
  );

  const inventorySummary = useMemo(() => {
    const total = inventoryEntries.length;
    const critical = inventoryEntries.filter((entry) => entry.critical).length;
    const warning = inventoryEntries.filter((entry) => entry.warning && !entry.critical).length;
    return {
      total,
      critical,
      warning,
      visible: displayedEntries.length,
    };
  }, [inventoryEntries, displayedEntries]);

  const inventoryHealth = useMemo(() => {
    const total = Math.max(1, Number(metrics.total_variants || 0));
    const lowStockCount = Number(metrics.low_stock_count || 0);
    const healthyCount = Math.max(0, total - lowStockCount);
    const healthyPercent = Math.round((healthyCount / total) * 100);
    return {
      healthyCount,
      lowStockCount,
      healthyPercent,
    };
  }, [metrics.total_variants, metrics.low_stock_count]);

  const metricsUpdatedLabel = useMemo(() => {
    if (!metricsUpdatedAt) return "Ainda nao atualizado";
    return formatDateTimePtBr(metricsUpdatedAt);
  }, [metricsUpdatedAt]);
  const orderingLabel = useMemo(
    () => ORDERING_OPTIONS.find((option) => option.value === ordering)?.label || "Padrao",
    [ordering]
  );

  const isBusy = loading || metricsLoading || catalogLoading || catalogBatchSaving || saving;
  const skeletonRows = useMemo(() => Array.from({ length: 6 }, (_, index) => index), []);

  const applyAlertFilter = useCallback((value) => {
    setPage(1);
    setAlertFilter(value);
  }, []);

  const handlePrepareRestock = useCallback(
    async (item) => {
      const query = `${item?.product_name || ""} ${item?.brand || ""}`.trim();
      if (!query) return;
      setOperacaoSearch(query);
      await loadOperacaoItems(query, true);
      setOperacaoForm((prev) => ({
        ...prev,
        tipo: "RECEIVE",
        package_name: "UNIDADE",
        package_quantity: "1",
        notes: `Reposicao sugerida para ${corrigirOrtografiaUI(item?.product_name || "")}`,
      }));
      showToast("Item pronto para reposicao na secao Operacao de estoque.", "info");
    },
    [loadOperacaoItems, showToast]
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
    showToast("Marca e tamanho aplicados ao formulario.", "success");
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
    showToast("Selecao adicionada ao lote.", "success");
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
      showToast(`${successCount} item(ns) do lote processado(s).`, "success");
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
        showToast("Nenhum produto encontrado para esse codigo.", "warning");
      }
      notifyCatalogFallback(data.meta);
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
        showToast("Nenhum produto encontrado para essa busca.", "warning");
      }
      notifyCatalogFallback(data.meta);
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
      showToast("Reposicao realizada com sucesso.", "success");
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
      showToast("Movimentacao registrada.", "success");
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
        <AuthLoadingView />
      </>
    );
  }

  if (!session) {
    return (
      <>
        <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
        <LoginView
          loginForm={loginForm}
          setLoginForm={setLoginForm}
          handleLogin={handleLogin}
          loginLoading={loginLoading}
          authError={authError}
        />
      </>
    );
  }

  return (
    <>
      <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
      <main className="layout">
      <DashboardHeader username={session.username} canWrite={canWrite} onLogout={logout} />

      <MetricsSection
        metricsLoading={metricsLoading}
        metrics={metrics}
        metricsUpdatedLabel={metricsUpdatedLabel}
      />

      <section className="panel dashboard-panel">
        <div className="toolbar">
          <h2>Radar do dia</h2>
          <span className="muted">Foco em operacao e agilidade</span>
        </div>
        <div className="radar-grid">
          <article className="radar-card">
            <span>Saude do estoque</span>
            <strong>{inventoryHealth.healthyPercent}%</strong>
            <p>
              {inventoryHealth.healthyCount} variacoes estaveis e {inventoryHealth.lowStockCount} em baixo estoque.
            </p>
            <div className="progress-track" role="progressbar" aria-valuenow={inventoryHealth.healthyPercent} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-fill" style={{ width: `${inventoryHealth.healthyPercent}%` }} />
            </div>
          </article>
          <article className="radar-card">
            <span>Pendencias criticas</span>
            <strong>{inventorySummary.critical}</strong>
            <p>Itens sem preco ou com risco alto para operacao.</p>
          </article>
          <article className="radar-card">
            <span>Avisos de atencao</span>
            <strong>{inventorySummary.warning}</strong>
            <p>Itens com risco moderado que valem revisao ainda hoje.</p>
          </article>
        </div>
        <div className="quick-actions-strip">
          <button type="button" className="ghost" onClick={() => scrollToSection(quickEntrySectionRef)}>
            Ir para Cadastro rapido
          </button>
          <button type="button" className="ghost" onClick={() => scrollToSection(operationSectionRef)}>
            Ir para Operacao
          </button>
          <button type="button" className="ghost" onClick={() => scrollToSection(inventorySectionRef)}>
            Ir para Itens cadastrados
          </button>
          <button type="button" className="ghost" onClick={() => applyAlertFilter("critical")}>
            Mostrar so criticos
          </button>
          <button type="button" className="ghost" onClick={reloadDashboardData}>
            Atualizar painel
          </button>
        </div>
        <p className="muted keyboard-hints">
          Atalhos: <code>/</code> buscar itens, <code>Alt+1</code> cadastro rapido, <code>Alt+2</code> operacao, <code>Alt+3</code> inventario, <code>Alt+R</code> atualizar painel.
        </p>
      </section>

      <SectorsSection
        setorAtivoId={setorAtivoId}
        setorAtivoNome={setorAtivoNome}
        setores={setores}
        onSetorTodos={handleSetorTodos}
        onSetorSelect={handleSetorSelect}
        corrigirOrtografiaUI={corrigirOrtografiaUI}
      />

      <SeasonalCampaignsSection
        currentMonthLabel={currentMonthLabel}
        seasonalCampaigns={seasonalCampaigns}
        activeSeasonalCampaignId={activeSeasonalCampaignId}
        applySeasonalFilter={applySeasonalFilter}
        corrigirOrtografiaUI={corrigirOrtografiaUI}
      />

      <QuickEntryPanel
        canWrite={canWrite}
        quickEntrySectionRef={quickEntrySectionRef}
        catalogMeta={catalogMeta}
        barcodeQuery={barcodeQuery}
        setBarcodeQuery={setBarcodeQuery}
        handleCatalogBarcodeLookup={handleCatalogBarcodeLookup}
        catalogLoading={catalogLoading}
        catalogQuery={catalogQuery}
        setCatalogQuery={setCatalogQuery}
        handleCatalogSearch={handleCatalogSearch}
        smartCatalogGroups={smartCatalogGroups}
        catalogBatchEntries={catalogBatchEntries}
        applyCatalogBatchSelections={applyCatalogBatchSelections}
        catalogBatchSaving={catalogBatchSaving}
        setCatalogBatchEntries={setCatalogBatchEntries}
        catalogUsageHistory={catalogUsageHistory}
        expandedCatalogGroups={expandedCatalogGroups}
        setExpandedCatalogGroups={setExpandedCatalogGroups}
        getGroupVariantOptions={getGroupVariantOptions}
        catalogChoices={catalogChoices}
        getGroupSizeOptions={getGroupSizeOptions}
        updateCatalogChoice={updateCatalogChoice}
        selectCatalogBrand={selectCatalogBrand}
        addCatalogBrandSelection={addCatalogBrandSelection}
        applyCatalogBrandSelection={applyCatalogBrandSelection}
        corrigirOrtografiaUI={corrigirOrtografiaUI}
        formatarTamanhoUI={formatarTamanhoUI}
      />

      <OperationsPanel
        canWrite={canWrite}
        operationSectionRef={operationSectionRef}
        operacaoItemSelecionado={operacaoItemSelecionado}
        operacaoContextLoading={operacaoContextLoading}
        operacaoLastMovement={operacaoLastMovement}
        saving={saving}
        handleOperacaoEstoque={handleOperacaoEstoque}
        operacaoSearch={operacaoSearch}
        setOperacaoSearch={setOperacaoSearch}
        handleOperacaoSearchSubmit={handleOperacaoSearchSubmit}
        operacaoSearching={operacaoSearching}
        operacaoForm={operacaoForm}
        setOperacaoForm={setOperacaoForm}
        operacaoItems={operacaoItems}
        showOperacaoAdvanced={showOperacaoAdvanced}
        setShowOperacaoAdvanced={setShowOperacaoAdvanced}
        operacaoPackageOptions={operacaoPackageOptions}
        movimentoLabel={movimentoLabel}
        formatDateTimePtBr={formatDateTimePtBr}
      />

      <InventoryPanel
        inventorySectionRef={inventorySectionRef}
        inventorySearchRef={inventorySearchRef}
        search={search}
        setSearch={setSearch}
        activeSeasonalCampaignId={activeSeasonalCampaignId}
        deactivateSeasonalFilter={deactivateSeasonalFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        ordering={ordering}
        setOrdering={setOrdering}
        setorAtivoId={setorAtivoId}
        setorAtivoNome={setorAtivoNome}
        inventorySummary={inventorySummary}
        orderingLabel={orderingLabel}
        alertFilter={alertFilter}
        applyAlertFilter={applyAlertFilter}
        canWrite={canWrite}
        inventoryAttentionList={inventoryAttentionList}
        handlePrepareRestock={handlePrepareRestock}
        activeSeasonalCampaign={activeSeasonalCampaign}
        searchApplied={searchApplied}
        loading={loading}
        displayedEntries={displayedEntries}
        activeSeasonalTerms={activeSeasonalTerms}
        applySeasonalTerm={applySeasonalTerm}
        clearSeasonalFilter={clearSeasonalFilter}
        error={error}
        reloadDashboardData={reloadDashboardData}
        skeletonRows={skeletonRows}
        clearInventoryFilters={clearInventoryFilters}
        restockQty={restockQty}
        setRestockQty={setRestockQty}
        restockPackage={restockPackage}
        setRestockPackage={setRestockPackage}
        handleRestock={handleRestock}
        page={page}
        pageCount={pageCount}
        setPage={setPage}
        movimentosLimit={movimentosLimit}
        setMovimentosLimit={setMovimentosLimit}
        movimentos={movimentos}
        formatDateTimePtBr={formatDateTimePtBr}
        corrigirOrtografiaUI={corrigirOrtografiaUI}
        formatarTamanhoUI={formatarTamanhoUI}
        formatCurrency={formatCurrency}
        movimentoLabel={movimentoLabel}
        normalizarTexto={normalizarTexto}
      />
      {isBusy ? <p className="muted global-status">Operacao em andamento...</p> : null}
      {toast ? (
        <div className={`feedback toast ${toast.type || "success"}`} role="status" aria-live="polite">
          <p>{toast.message}</p>
          <button type="button" className="ghost" onClick={() => setToast(null)}>
            Fechar
          </button>
        </div>
      ) : null}
      </main>
    </>
  );
}

export default App;


















