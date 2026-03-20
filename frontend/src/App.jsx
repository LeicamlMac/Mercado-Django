import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

const STORAGE_KEY = "mercado_auth_tokens";

const emptyQuickForm = {
  department_names: [],
  category_name: "",
  product_name: "",
  brand: "",
  variant_label: "",
  package_size: "",
  package_name: "UNIDADE",
  package_units: "1",
  price: "",
  quantity: "1",
};

const emptyOperacaoForm = {
  variant_id: "",
  tipo: "RECEIVE",
  package_name: "UNIDADE",
  package_quantity: "1",
  quantity_units: "1",
  notes: "",
};

const movimentoLabel = {
  RECEIVE: "Recebimento",
  SELL: "Venda",
  ADJUST: "Ajuste",
  LOSS: "Perda",
  RETURN: "Devolucao",
};

const SETORES_PADRAO = [
  "Mercearia",
  "Laticinios",
  "Bebidas",
  "Carnes",
  "Doces",
  "Higiene",
  "Higiene Pessoal",
  "Limpeza",
  "Padaria",
  "Congelados",
];

const EMPTY_CATALOG_META = {
  bluesoft_configurada: false,
  resultados_bluesoft: 0,
  resultados_locais: 0,
  fonte_item: "",
};

function normalizarTexto(value) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function regraPossuiProduto(regra) {
  return (regra?.products || []).length > 0;
}

function regraCombinaProduto(regra, nomeProdutoNormalizado) {
  if (!nomeProdutoNormalizado) return false;
  return (regra?.products || []).some((item) => {
    const produtoRegra = normalizarTexto(item);
    return (
      produtoRegra === nomeProdutoNormalizado ||
      nomeProdutoNormalizado.includes(produtoRegra) ||
      produtoRegra.includes(nomeProdutoNormalizado)
    );
  });
}

function loadStoredTokens() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredTokens(tokens) {
  if (!tokens) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (typeof body?.detail === "string") {
      throw new Error(body.detail);
    }
    if (typeof body === "object" && body !== null) {
      const firstError = Object.values(body).flat()[0];
      if (typeof firstError === "string") {
        throw new Error(firstError);
      }
    }
    throw new Error("NÃ£o foi possÃ­vel concluir a requisiÃ§Ã£o.");
  }

  return body;
}

function App() {
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [ordering, setOrdering] = useState("-updated_at");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restockQty, setRestockQty] = useState({});
  const [restockPackage, setRestockPackage] = useState({});
  const [operacaoForm, setOperacaoForm] = useState(emptyOperacaoForm);
  const [movimentos, setMovimentos] = useState([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [barcodeQuery, setBarcodeQuery] = useState("");
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogMeta, setCatalogMeta] = useState(EMPTY_CATALOG_META);

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

  const catalogItemsDedup = useMemo(() => {
    const seen = new Set();
    const unique = [];
    for (const item of catalogItems || []) {
      const key = [
        normalizarTexto(item?.product_name),
        normalizarTexto(item?.variant_label || "tradicional"),
        normalizarTexto(item?.brand),
        normalizarTexto(item?.package_size),
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return unique;
  }, [catalogItems]);

  const opcoesTipo = useMemo(() => {
    if (regraProdutoAtual?.types?.length) return regraProdutoAtual.types;
    const nomeProduto = normalizarTexto(quickForm.product_name);
    if (!nomeProduto) return presets.variant_labels || [];

    const tipos = new Set();
    (catalogItemsDedup || []).forEach((item) => {
      if (normalizarTexto(item.product_name) === nomeProduto && item.variant_label) {
        tipos.add(item.variant_label);
      }
    });
    return Array.from(tipos);
  }, [regraProdutoAtual, presets.variant_labels, quickForm.product_name, catalogItemsDedup]);

  const opcoesTamanho = useMemo(() => {
    if (regraProdutoAtual?.sizes?.length) return regraProdutoAtual.sizes;
    return presets.package_sizes || [];
  }, [regraProdutoAtual, presets.package_sizes]);

  const opcoesCategoria = useMemo(() => {
    const nomeProduto = normalizarTexto(quickForm.product_name);
    if (!nomeProduto) return presets.categories || [];

    const categorias = new Set();
    (items || []).forEach((item) => {
      if (normalizarTexto(item.product_name) === nomeProduto && item.category_name) {
        categorias.add(item.category_name);
      }
    });
    (catalogItemsDedup || []).forEach((item) => {
      if (normalizarTexto(item.product_name) === nomeProduto && item.category) {
        categorias.add(item.category);
      }
    });
    if (!categorias.size) return [];
    return Array.from(categorias);
  }, [quickForm.product_name, items, catalogItemsDedup, presets.categories]);

  const opcoesMarca = useMemo(() => {
    const nomeProduto = normalizarTexto(quickForm.product_name);
    if (!nomeProduto) return presets.brands || [];

    const marcas = new Set();
    (items || []).forEach((item) => {
      if (normalizarTexto(item.product_name) === nomeProduto && item.brand) {
        marcas.add(item.brand);
      }
    });
    (catalogItemsDedup || []).forEach((item) => {
      if (normalizarTexto(item.product_name) === nomeProduto && item.brand) {
        marcas.add(item.brand);
      }
    });
    if (!marcas.size) return [];
    return Array.from(marcas);
  }, [quickForm.product_name, items, catalogItemsDedup, presets.brands]);

  const opcoesProduto = useMemo(() => {
    const merged = [...(presets.products || [])];
    for (const item of catalogItemsDedup || []) {
      if (item?.product_name && !merged.includes(item.product_name)) {
        merged.push(item.product_name);
      }
    }
    return merged;
  }, [presets.products, catalogItemsDedup]);

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
      throw new Error("SessÃ£o expirada. Entre novamente.");
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
        throw new Error("UsuÃ¡rio nÃ£o autenticado.");
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
        if (typeof body?.detail === "string") {
          throw new Error(body.detail);
        }
        if (typeof body === "object" && body !== null) {
          const firstError = Object.values(body).flat()[0];
          if (typeof firstError === "string") {
            throw new Error(firstError);
          }
        }
        throw new Error("NÃ£o foi possÃ­vel concluir a requisiÃ§Ã£o.");
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
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter !== "all") params.set("is_active", statusFilter);
    if (setorAtivoId !== "all") params.set("department_id", setorAtivoId);
    return params.toString();
  }, [page, ordering, search, statusFilter, setorAtivoId]);

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
      const data = await apiRequest("/api/movements/?page=1");
      setMovimentos(data.results || []);
    } catch {
      // Optional in UI.
    }
  }, [session, apiRequest]);

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
    loadSetores();
  }, [loadMetrics, loadPresets, loadMovimentos, loadSetores]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (setorAtivoId === "all") return;
    const setorAtivo = setores.find((s) => String(s.id) === String(setorAtivoId));
    if (!setorAtivo) return;
    setQuickForm((prev) => {
      if (
        prev.department_names.length === 1 &&
        prev.department_names[0] === setorAtivo.name
      ) {
        return prev;
      }
      return { ...prev, department_names: [setorAtivo.name] };
    });
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
    setQuickForm((prev) => ({
      ...prev,
      department_names: item.department_names?.length
        ? item.department_names
        : prev.department_names,
      category_name: item.category || prev.category_name,
      product_name: item.product_name || prev.product_name,
      brand: item.brand || prev.brand,
      variant_label: item.variant_label || prev.variant_label,
      package_size: item.package_size || prev.package_size,
      package_name: item.package_name || prev.package_name,
      package_units: String(item.package_units || prev.package_units || "1"),
    }));
    setToast("Produto aplicado ao formulÃ¡rio.");
  }

  async function handleCatalogBarcodeLookup() {
    const code = (barcodeQuery || "").trim();
    if (!code) {
      setError("Informe um cÃ³digo de barras para buscar.");
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
        setToast("Nenhum produto encontrado para esse cÃ³digo.");
      }
      if (data.meta && !data.meta.bluesoft_configurada) {
        setToast("Bluesoft nÃ£o configurada neste terminal. Usando catÃ¡logo local.");
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
      setError("Digite ao menos 2 caracteres para pesquisar no catÃ¡logo.");
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
      const data = await apiRequest(/api/catalog/lookup/?);
      setCatalogItems(data.items || []);
      setCatalogMeta(data.meta || EMPTY_CATALOG_META);
      if (!(data.items || []).length) {
        setToast("Nenhum produto encontrado para essa busca.");
      }
      if (data.meta && !data.meta.bluesoft_configurada) {
        setToast("Bluesoft nÃ£o configurada neste terminal. Usando catÃ¡logo local.");
      }
    } catch (lookupError) {
      setError(lookupError.message);
    } finally {
      setCatalogLoading(false);
    }
  }

  async function handleQuickEntry(event) {
    event.preventDefault();
    if (
      !quickForm.category_name ||
      !quickForm.product_name ||
      !quickForm.brand ||
      !quickForm.package_size ||
      !quickForm.price
    ) {
      setError("Preencha categoria, produto, marca, tamanho da embalagem e preÃ§o.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        ...quickForm,
        department_names: quickForm.department_names,
        price: Number(quickForm.price),
        quantity: Number(quickForm.quantity || 1),
        package_units: Number(quickForm.package_units || 1),
      };
      const response = await apiRequest("/api/items/quick-entry/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setToast(response.action === "created" ? "Item criado." : "Item reposto.");
      setQuickForm((prev) => ({ ...prev, price: "", quantity: "1" }));
      await Promise.all([loadItems(), loadMetrics(), loadPresets()]);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRestock(itemId) {
    const qty = Number(restockQty[itemId] || 1);
    if (qty < 1) {
      setError("A quantidade de reposicao deve ser no minimo 1.");
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

    const endpointMap = {
      RECEIVE: "/api/items/receive/",
      SELL: "/api/items/sell/",
      ADJUST: "/api/items/adjust/",
    };
    const endpoint = endpointMap[operacaoForm.tipo];
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
      setToast("Movimentacao registrada.");
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
      <main className="layout">
        <p>Validando sessao...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="layout">
        <header className="hero">
          <p className="eyebrow">Mercado Stack</p>
          <h1>Entrar</h1>
          <p>Use um usuario cadastrado para acessar o sistema.</p>
        </header>
        <section className="panel auth-card">
          <form className="form-grid" onSubmit={handleLogin}>
            <label>
              UsuÃ¡rio
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
            UsuÃ¡rios de teste: <code>manager / Manager@123</code> e{" "}
            <code>viewer / Viewer@123</code>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="layout">
      <header className="hero topbar">
        <div>
          <p className="eyebrow">Mercado Stack</p>
          <h1>Gestao de estoque</h1>
          <p>Cadastro por categoria e movimentaÃ§Ã£o por embalagem (fardo, caixa, unidade).</p>
        </div>
        <div className="session-box">
          <strong>{session.username}</strong>
          <span>{canWrite ? "Gerente de catÃ¡logo" : "Visualizador"}</span>
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
            onClick={() => {
              setPage(1);
              setSetorAtivoId("all");
            }}
          >
            Todos
          </button>
          {setores.map((setor) => (
            <button
              key={setor.id}
              type="button"
              className={String(setor.id) === String(setorAtivoId) ? "tab-setor ativo" : "tab-setor"}
              onClick={() => {
                setPage(1);
                setSetorAtivoId(String(setor.id));
              }}
            >
              {setor.name}
            </button>
          ))}
        </div>
      </section>

      {canWrite ? (
        <section className="panel">
          <h2>Entrada rÃ¡pida (cria ou repÃµe automaticamente)</h2>
          <p className="hint">
            Dica: ao informar o produto (ex: Leite, Arroz, Refrigerante), o formulÃ¡rio
            sugere automaticamente tipo, tamanho e embalagem mais comum.
          </p>
          <div className="catalog-assistant">
            <h3>Assistente de catÃ¡logo</h3>
            <p className="hint">
              Fonte ativa: {catalogMeta.bluesoft_configurada ? "Bluesoft + local" : "CatÃ¡logo local (configure Bluesoft)"}.
              {catalogMeta.resultados_bluesoft || catalogMeta.resultados_locais
                ? ` Resultados: Bluesoft ${catalogMeta.resultados_bluesoft || 0}, local ${catalogMeta.resultados_locais || 0}.`
                : ""}
            </p>
            <div className="catalog-search-row">
              <input
                value={barcodeQuery}
                onChange={(event) => setBarcodeQuery(event.target.value)}
                placeholder="CÃ³digo de barras (EAN/GTIN)"
              />
              <button type="button" onClick={handleCatalogBarcodeLookup} disabled={catalogLoading}>
                {catalogLoading ? "Buscando..." : "Buscar por cÃ³digo"}
              </button>
            </div>
            <div className="catalog-search-row">
              <input
                value={catalogQuery}
                onChange={(event) => setCatalogQuery(event.target.value)}
                placeholder="Pesquisar produto no catÃ¡logo (ex: refrigerante cola)"
              />
              <button type="button" className="ghost" onClick={handleCatalogSearch} disabled={catalogLoading}>
                Pesquisar nome
              </button>
            </div>
            {catalogItemsDedup.length ? (
              <div className="catalog-results">
                {catalogItemsDedup.slice(0, 20).map((item) => (
                  <article
                    key={`${item.source}-${item.product_name}-${item.variant_label}-${item.brand}-${item.package_size}`}
                    className="catalog-item"
                  >
                    <div>
                      <strong>
                        {`${item.product_name} ${item.variant_label || "Tradicional"} — ${item.brand} — ${item.package_size}`}
                      </strong>
                      <p>{item.category} - fonte: {item.source}</p>
                    </div>
                    <button type="button" onClick={() => applyCatalogItem(item)}>
                      Usar
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
          <form className="form-grid" onSubmit={handleQuickEntry}>
            <label>
              Setores (pode marcar mais de um)
              <div className="setores-grid">
                {setores.map((setor) => {
                  const marcado = quickForm.department_names.includes(setor.name);
                  return (
                    <button
                      key={setor.id}
                      type="button"
                      className={marcado ? "chip-setor ativo" : "chip-setor"}
                      onClick={() =>
                        setQuickForm((prev) => ({
                          ...prev,
                          department_names: marcado
                            ? prev.department_names.filter((n) => n !== setor.name)
                            : [...prev.department_names, setor.name],
                        }))
                      }
                    >
                      {setor.name}
                    </button>
                  );
                })}
              </div>
            </label>
            <label>
              Categoria
              <input
                list="categories"
                value={quickForm.category_name}
                onChange={(event) =>
                  setQuickForm((prev) => ({ ...prev, category_name: event.target.value }))
                }
                placeholder="Arroz, Feijao..."
              />
            </label>
            <label>
              Produto
              <input
                list="products"
                value={quickForm.product_name}
                onChange={(event) => {
                  const proximoProduto = event.target.value;
                  setCatalogQuery(proximoProduto);
                  setCatalogItems([]);
                  setCatalogMeta(EMPTY_CATALOG_META);
                  setQuickForm((prev) => {
                    const mudouProduto =
                      normalizarTexto(prev.product_name) !== normalizarTexto(proximoProduto);
                    if (!mudouProduto) {
                      return { ...prev, product_name: proximoProduto };
                    }
                    return {
                      ...prev,
                      product_name: proximoProduto,
                      // Evita "vazamento" de marca/tipo de outro produto.
                      brand: "",
                      variant_label: "",
                    };
                  });
                }}
                placeholder="Arroz"
              />
            </label>
            <label>
              Marca
              <input
                list="brands"
                value={quickForm.brand}
                onChange={(event) =>
                  setQuickForm((prev) => ({ ...prev, brand: event.target.value }))
                }
                placeholder="Camil"
              />
            </label>
            <label>
              Tipo
              <input
                list="variants"
                value={quickForm.variant_label}
                onChange={(event) =>
                  setQuickForm((prev) => ({ ...prev, variant_label: event.target.value }))
                }
                placeholder="Branco, Parboilizado..."
              />
            </label>
            <label>
              Tamanho
              <input
                list="sizes"
                value={quickForm.package_size}
                onChange={(event) =>
                  setQuickForm((prev) => ({ ...prev, package_size: event.target.value }))
                }
                placeholder="1KG"
              />
            </label>
            <label>
              Embalagem da entrada
              <input
                list="package-names"
                value={quickForm.package_name}
                onChange={(event) =>
                  setQuickForm((prev) => ({ ...prev, package_name: event.target.value }))
                }
                placeholder="UNIDADE, FARDO..."
              />
            </label>
            <label>
              Unidades por embalagem
              <input
                type="number"
                min="1"
                step="1"
                value={quickForm.package_units}
                onChange={(event) =>
                  setQuickForm((prev) => ({ ...prev, package_units: event.target.value }))
                }
              />
            </label>
            <label>
              Preco
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={quickForm.price}
                onChange={(event) =>
                  setQuickForm((prev) => ({ ...prev, price: event.target.value }))
                }
              />
            </label>
            <label>
              Quantidade para entrada
              <input
                type="number"
                min="1"
                step="1"
                value={quickForm.quantity}
                onChange={(event) =>
                  setQuickForm((prev) => ({ ...prev, quantity: event.target.value }))
                }
              />
            </label>
            <div className="actions full-width">
              <button type="submit" disabled={saving}>
                {saving ? "Processando..." : "Salvar entrada"}
              </button>
            </div>
          </form>

          <datalist id="categories">
            {opcoesCategoria.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <datalist id="products">
            {opcoesProduto.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <datalist id="brands">
            {opcoesMarca.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <datalist id="variants">
            {opcoesTipo.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <datalist id="sizes">
            {opcoesTamanho.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <datalist id="package-names">
            {presets.package_names.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </section>
      ) : (
        <section className="panel">
          <p className="feedback">Modo visualizaÃ§Ã£o. Cadastro e reposiÃ§Ã£o bloqueados.</p>
        </section>
      )}

      {canWrite ? (
        <section className="panel">
          <h2>Operacao de estoque</h2>
          <form className="form-grid" onSubmit={handleOperacaoEstoque}>
            <label>
              Item
              <select
                value={operacaoForm.variant_id}
                onChange={(event) =>
                  setOperacaoForm((prev) => ({ ...prev, variant_id: event.target.value }))
                }
              >
                <option value="">Selecione...</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.product_name} {item.variant_label || "Padrao"} {item.package_size} ({item.brand})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo de movimentaÃ§Ã£o
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

            {operacaoForm.tipo === "ADJUST" ? (
              <label>
                Ajuste em unidades
                <input
                  type="number"
                  step="1"
                  value={operacaoForm.quantity_units}
                  onChange={(event) =>
                    setOperacaoForm((prev) => ({
                      ...prev,
                      quantity_units: event.target.value,
                    }))
                  }
                />
              </label>
            ) : (
              <>
                <label>
                  Embalagem
                  <input
                    list="package-names"
                    value={operacaoForm.package_name}
                    onChange={(event) =>
                      setOperacaoForm((prev) => ({
                        ...prev,
                        package_name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Quantidade de embalagens
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={operacaoForm.package_quantity}
                    onChange={(event) =>
                      setOperacaoForm((prev) => ({
                        ...prev,
                        package_quantity: event.target.value,
                      }))
                    }
                  />
                </label>
              </>
            )}
            <label className="full-width">
              Observacao
              <input
                value={operacaoForm.notes}
                onChange={(event) =>
                  setOperacaoForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder="Ex: compra semanal, venda balcao, ajuste inventario"
              />
            </label>
            <div className="actions full-width">
              <button type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Registrar movimentaÃ§Ã£o"}
              </button>
            </div>
          </form>
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
                setPage(1);
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
              <option value="all">Todos</option>
              <option value="true">Ativos</option>
              <option value="false">Inativos</option>
            </select>
            <select value={ordering} onChange={(event) => setOrdering(event.target.value)}>
              <option value="-updated_at">Atualizados recentemente</option>
              <option value="-stock">Maior estoque</option>
              <option value="stock">Menor estoque</option>
              <option value="-price">Maior preÃ§o</option>
              <option value="price">Menor preÃ§o</option>
            </select>
          </div>
        </div>

        {loading ? <p>Carregando itens...</p> : null}
        {!loading && !items.length ? <p>Nenhum item encontrado.</p> : null}

        {!loading && items.length ? (
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
                  <th>AÃ§Ã£o rÃ¡pida</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.category_name}</td>
                    <td>{(item.departments || []).join(", ") || "-"}</td>
                    <td>{item.product_name}</td>
                    <td>{item.brand}</td>
                    <td>{item.variant_label || "Padrao"}</td>
                    <td>{item.package_size}</td>
                    <td>R$ {Number(item.price).toFixed(2)}</td>
                    <td>
                      <span className={item.stock < 5 ? "tag warning" : "tag good"}>
                        {item.stock}
                      </span>
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
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

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
            PÃ¡gina {page} de {pageCount}
          </span>
          <button
            type="button"
            className="ghost"
            disabled={page >= pageCount}
            onClick={() => setPage((prev) => prev + 1)}
          >
            PrÃ³xima
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Movimentacoes recentes</h2>
        {!movimentos.length ? <p>Sem movimentacoes recentes.</p> : null}
        {movimentos.length ? (
          <div className="table-wrap">
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
                {movimentos.slice(0, 10).map((mov) => (
                  <tr key={mov.id}>
                    <td>{new Date(mov.created_at).toLocaleString("pt-BR")}</td>
                    <td>{mov.item_name}</td>
                    <td>{movimentoLabel[mov.movement_type] || mov.movement_type}</td>
                    <td>{mov.variant_label || "Padrao"}</td>
                    <td>{mov.package_name || "-"}</td>
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
  );
}

export default App;


