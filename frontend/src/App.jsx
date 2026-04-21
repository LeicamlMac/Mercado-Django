import { useCallback, useEffect, useState } from "react";
import "./App.css";

const STORAGE_KEY = "mercado_auth_tokens";
const THEME_STORAGE_KEY = "mercado_theme";
const DEFAULT_ORDERING = "product__name,product__brand,variant_label,package_size";

const ORDERING_OPTIONS = [
  { value: "product__name,product__brand,variant_label,package_size", label: "Produto (A-Z)" },
  { value: "-product__name,-product__brand,-variant_label,-package_size", label: "Produto (Z-A)" },
  { value: "-updated_at", label: "Atualizados recentemente" },
  { value: "-price", label: "Maior preço" },
  { value: "price", label: "Menor preço" },
];

const MOVIMENTO_ENDPOINTS = {
  RECEIVE: "/api/items/receive/",
  SELL: "/api/items/sell/",
  ADJUST: "/api/items/adjust/",
};

const emptyQuickForm = {
  department_names: [],
  category_name: "",
  name: "",
  brand: "",
  variant_label: "Padrão",
  package_size: "Unidade",
  price: "",
  initial_stock: 0,
};

function formatPrice(val) {
  const n = parseFloat(val);
  return isNaN(n) ? "0,00" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTimePtBr(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  return d.toLocaleString("pt-BR");
}

function corrigirOrtografiaUI(texto) {
  if (!texto) return "";
  let t = texto.replace(/laticinios/gi, "Laticínios");
  t = t.replace(/padaria/gi, "Padaria");
  t = t.replace(/higiene pessoal/gi, "Higiene Pessoal");
  t = t.replace(/bebidas/gi, "Bebidas");
  return t;
}

const movimentoLabel = {
  RECEIVE: "Entrada",
  SELL: "Venda",
  ADJUST: "Ajuste",
  INITIAL: "Início",
};

export default function App() {
  const [tokens, setTokens] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  const [activeTab, setActiveTab] = useState("estoque");
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_STORAGE_KEY) || "light");
  const [items, setItems] = useState([]);
  const [movimentos, setMovimentos] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [search, setSearch] = useState("");
  const [ordering, setOrdering] = useState(DEFAULT_ORDERING);
  const [movLimit, setMovLimit] = useState("12");
  const [quickForm, setQuickForm] = useState(emptyQuickForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (toast || error) {
      const timer = setTimeout(() => { setToast(null); setError(null); }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast, error]);

  const logout = useCallback(() => {
    setTokens(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const fetchWithAuth = useCallback(async (url, opts = {}) => {
    if (!tokens?.access) return null;
    const res = await fetch(url, {
      ...opts,
      headers: { 
        ...opts.headers, 
        Authorization: `Bearer ${tokens.access}`,
        "Content-Type": "application/json" 
      },
    });
    if (res.status === 401) { logout(); return null; }
    return res;
  }, [tokens, logout]);

  const loadData = useCallback(async () => {
    if (!tokens) return;
    setLoading(true);
    try {
      const [itRes, mvRes, meRes] = await Promise.all([
        fetchWithAuth(`/api/items/?search=${search}&ordering=${ordering}`),
        fetchWithAuth(`/api/movements/?limit=${movLimit}`),
        fetchWithAuth("/api/items/metrics/"),
      ]);
      if (itRes) setItems((await itRes.json()).results || []);
      if (mvRes) setMovimentos((await mvRes.json()).results || []);
      if (meRes) setMetrics(await meRes.json());
    } catch (e) { 
      setError("Erro ao carregar dados do servidor."); 
    } finally {
      setLoading(false);
    }
  }, [tokens, fetchWithAuth, search, ordering, movLimit]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!tokens) {
    return (
      <div className="login-shell">
        <form className="card login-card" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const res = await fetch("/api/auth/token/", {
            method: "POST",
            body: JSON.stringify(Object.fromEntries(fd)),
            headers: { "Content-Type": "application/json" }
          });
          if (res.ok) {
            const data = await res.json();
            setTokens(data);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
          } else { setError("Usuário ou senha incorretos."); }
        }}>
          <h1>SGV Mercado</h1>
          <input name="username" placeholder="Usuário" required />
          <input name="password" type="password" placeholder="Senha" required />
          <button type="submit" className="btn-primary">Entrar</button>
          {error && <p className="error-text">{error}</p>}
        </form>
      </div>
    );
  }

  return (
    <>
      <header className="main-header">
        <div className="header-content">
          <div className="brand">
            <span className="logo-icon">🏪</span>
            <h1>Mercado-SGV</h1>
          </div>
          <nav className="nav-tabs">
            <button className={activeTab === "estoque" ? "active" : ""} onClick={() => setActiveTab("estoque")}>📦 Estoque</button>
            <button className={activeTab === "vendas" ? "active" : ""} onClick={() => setActiveTab("vendas")}>💰 Vendas</button>
            <button className={activeTab === "entrada" ? "active" : ""} onClick={() => setActiveTab("entrada")}>📥 Entrada</button>
            <button className={activeTab === "relatorios" ? "active" : ""} onClick={() => setActiveTab("relatorios")}>📊 Relatórios</button>
          </nav>
          <div className="header-actions">
            <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} className="btn-icon">
              {theme === "light" ? "🌙" : "☀️"}
            </button>
            <button onClick={logout} className="btn-outline">Sair</button>
          </div>
        </div>
      </header>

      <main className="container">
        {/* ABA: ESTOQUE */}
        {activeTab === "estoque" && (
          <section className="card fade-in">
            <div className="section-header">
              <h2>Lista de Produtos</h2>
              <div className="filters">
                <input type="text" placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
                <select value={ordering} onChange={(e) => setOrdering(e.target.value)}>
                  {ORDERING_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Variação</th>
                    <th>Preço</th>
                    <th>Estoque</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td><strong>{corrigirOrtografiaUI(item.product_name)}</strong> <small>{item.brand}</small></td>
                      <td>{item.variant_label} ({item.package_size})</td>
                      <td>R$ {formatPrice(item.price)}</td>
                      <td>
                        <span className={`stock-tag ${item.stock <= 5 ? 'warning' : 'good'}`}>{item.stock} un</span>
                      </td>
                      <td>{item.is_active ? "✅" : "❌"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ABA: VENDAS */}
        {activeTab === "vendas" && (
          <section className="card fade-in">
            <div className="section-header">
              <h2>Registrar Venda</h2>
              <p className="subtitle">Saída imediata de produtos do estoque.</p>
            </div>
            <form className="operation-form" onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              const data = {
                variant_id: formData.get("variant_id"),
                quantity_units: parseInt(formData.get("quantity")),
              };
              const res = await fetchWithAuth(MOVIMENTO_ENDPOINTS.SELL, {
                method: "POST",
                body: JSON.stringify(data),
              });
              if (res?.ok) {
                setToast("Venda registrada com sucesso!");
                loadData();
                e.target.reset();
              } else { setError("Erro na venda. Verifique se há estoque suficiente."); }
            }}>
              <div className="form-group">
                <label>Produto</label>
                <select name="variant_id" required>
                  <option value="">Selecione um item...</option>
                  {items.filter(i => i.stock > 0).map(item => (
                    <option key={item.id} value={item.id}>
                      {item.product_name} - {item.variant_label} (Disponível: {item.stock})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Quantidade</label>
                <input name="quantity" type="number" min="1" defaultValue="1" required />
              </div>
              <button type="submit" className="btn-primary">Confirmar Venda</button>
            </form>
          </section>
        )}

        {/* ABA: ENTRADA */}
        {activeTab === "entrada" && (
          <section className="card fade-in">
            <div className="section-header">
              <h2>Entrada de Mercadoria</h2>
              <p className="subtitle">Cadastre novos produtos ou adicione estoque aos existentes.</p>
            </div>
            <form className="quick-entry-grid" onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              const res = await fetchWithAuth("/api/items/quick-entry/", {
                method: "POST",
                body: JSON.stringify(quickForm),
              });
              if (res?.ok) {
                setToast("Entrada processada com sucesso!");
                setQuickForm(emptyQuickForm);
                loadData();
              } else { setError("Erro ao processar entrada. Verifique os campos."); }
              setLoading(false);
            }}>
              <div className="form-row">
                <input placeholder="Nome do Produto" value={quickForm.name} onChange={e => setQuickForm({...quickForm, name: e.target.value})} required />
                <input placeholder="Marca" value={quickForm.brand} onChange={e => setQuickForm({...quickForm, brand: e.target.value})} />
              </div>
              <div className="form-row">
                <input placeholder="Categoria (ex: Bebidas)" value={quickForm.category_name} onChange={e => setQuickForm({...quickForm, category_name: e.target.value})} required />
                <input placeholder="Preço de Venda" type="number" step="0.01" value={quickForm.price} onChange={e => setQuickForm({...quickForm, price: e.target.value})} required />
              </div>
              <div className="form-row">
                <input placeholder="Qtd. Inicial" type="number" value={quickForm.initial_stock} onChange={e => setQuickForm({...quickForm, initial_stock: e.target.value})} />
                <select value={quickForm.package_size} onChange={e => setQuickForm({...quickForm, package_size: e.target.value})}>
                  <option value="Unidade">Unidade</option>
                  <option value="1KG">1 KG</option>
                  <option value="500G">500 G</option>
                </select>
              </div>
              <button type="submit" className="btn-success" disabled={loading}>
                {loading ? "Gravando..." : "Salvar Entrada"}
              </button>
            </form>
          </section>
        )}

        {/* ABA: RELATÓRIOS */}
        {activeTab === "relatorios" && (
          <section className="fade-in">
            <div className="metrics">
              <div className="metric-card">
                <span className="label">Total de Variações</span>
                <span className="value">{metrics?.total_variants || 0}</span>
              </div>
              <div className="metric-card">
                <span className="label">Patrimônio em Estoque</span>
                <span className="value">R$ {formatPrice(metrics?.stock_value || 0)}</span>
              </div>
            </div>
            <div className="card mt-20">
              <div className="section-header">
                <h2>Histórico Recente</h2>
                <select value={movLimit} onChange={(e) => setMovLimit(e.target.value)}>
                  <option value="12">Últimas 12</option>
                  <option value="24">Últimas 24</option>
                  <option value="50">Últimas 50</option>
                </select>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data/Hora</th>
                      <th>Produto</th>
                      <th>Operação</th>
                      <th>Qtd (un)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimentos.map(mov => (
                      <tr key={mov.id}>
                        <td>{formatDateTimePtBr(mov.created_at)}</td>
                        <td>{corrigirOrtografiaUI(mov.item_name)}</td>
                        <td><span className={`badge ${mov.movement_type.toLowerCase()}`}>{movimentoLabel[mov.movement_type]}</span></td>
                        <td style={{ color: mov.units_delta < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 'bold' }}>
                          {mov.units_delta > 0 ? `+${mov.units_delta}` : mov.units_delta}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* Mensagens Flutuantes */}
        {error && <div className="feedback error fade-in">{error}</div>}
        {toast && <div className="feedback success fade-in">{toast}</div>}
      </main>
    </>
  );
}