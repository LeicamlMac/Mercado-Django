export const STORAGE_KEY = "mercado_auth_tokens";
export const THEME_STORAGE_KEY = "mercado_theme";
export const CATALOG_USAGE_STORAGE_KEY = "mercado_catalog_usage_v1";

export const DEFAULT_ORDERING = "product__name,product__brand,variant_label,package_size";

export const ORDERING_OPTIONS = [
  { value: DEFAULT_ORDERING, label: "Produto (A-Z)" },
  { value: "-product__name,-product__brand,-variant_label,-package_size", label: "Produto (Z-A)" },
  { value: "-updated_at", label: "Atualizados recentemente" },
  { value: "-price", label: "Maior preco" },
  { value: "price", label: "Menor preco" },
];

export const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "true", label: "Ativos" },
  { value: "false", label: "Inativos" },
];

export const MOVIMENTO_LIMIT_OPTIONS = ["12", "24", "50"];

export const MOVIMENTO_ENDPOINTS = {
  RECEIVE: "/api/items/receive/",
  SELL: "/api/items/sell/",
  ADJUST: "/api/items/adjust/",
};

export const EMPTY_QUICK_FORM = {
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

export const EMPTY_OPERACAO_FORM = {
  variant_id: "",
  tipo: "RECEIVE",
  package_name: "UNIDADE",
  package_quantity: "1",
  quantity_units: "1",
  notes: "",
};

export const MOVIMENTO_LABEL = {
  RECEIVE: "Recebimento",
  SELL: "Venda",
  ADJUST: "Ajuste",
  LOSS: "Perda",
  RETURN: "Devolução",
};

export const SETORES_PADRAO = [
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
  "Hortifruti",
  "Frios",
  "Pet Shop",
  "Bebe",
  "Farmacia",
  "Utilidades",
  "Granel",
];

export const EMPTY_CATALOG_META = {
  bluesoft_configurada: false,
  resultados_bluesoft: 0,
  resultados_locais: 0,
  fonte_item: "",
};

export const DEFAULT_VARIANT_LABEL = "Tradicional";
export const FEIJAO_PRODUCT_TOKEN = "feij";
export const FEIJAO_VARIANT_PRETO = "Preto";

const DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const PT_BR_COLLATOR = new Intl.Collator("pt-BR");
const SIZE_REGEX = /(\d+(?:\.\d+)?)\s*(kg|g|l|ml|un)$/i;
const LITERS_UI_REGEX = /^(\d+(?:[.,]\d+)?)\s*L$/i;

const ORTHOGRAPHY_SUBSTITUTIONS = [
  [/Laticinios/gi, "Laticínios"],
  [/Higienico/gi, "Higiênico"],
  [/Acucar/gi, "Açúcar"],
  [/Cafe Soluvel/gi, "Café Solúvel"],
  [/\bCafe\b/gi, "Café"],
  [/\bCha\b/gi, "Chá"],
  [/Limao/gi, "Limão"],
  [/Maracuja/gi, "Maracujá"],
  [/Pao de Queijo/gi, "Pão de Queijo"],
  [/Pao de Alho/gi, "Pão de Alho"],
  [/\bPao\b/gi, "Pão"],
  [/Sabao em Po/gi, "Sabão em Pó"],
  [/\bSabao\b/gi, "Sabão"],
  [/Agua Sanitaria/gi, "Água Sanitária"],
  [/\bAgua\b/gi, "Água"],
  [/Linguica/gi, "Linguiça"],
  [/Anticaries/gi, "Anticáries"],
  [/Sem Acucar/gi, "Sem Açúcar"],
  [/Liquido/gi, "Líquido"],
  [/Hidratacao/gi, "Hidratação"],
  [/Reconstrucao/gi, "Reconstrução"],
  [/Maca\b/gi, "Maçã"],
  [/Acafrao/gi, "Açafrão"],
  [/Acai/gi, "Açaí"],
  [/\bAco\b/gi, "Aço"],
  [/\bPacoca\b/gi, "Paçoca"],
  [/\bMaco\b/gi, "Maço"],
  [/Ovo de Pascoa/gi, "Ovo de Páscoa"],
  [/Bebe/gi, "Bebê"],
  [/Farmacia/gi, "Farmácia"],
  [/Elegê/gi, "Elegê"],
  [/Feijao-de-corda/gi, "Feijao-de-corda"],
  [/Feijao/gi, "Feijao"],
];

function getFirstApiErrorValue(payload) {
  if (!payload || typeof payload !== "object") return null;
  const values = Object.values(payload).flat();
  const first = values[0];
  return typeof first === "string" ? first : null;
}

function parseStoredJson(rawValue, fallback) {
  if (!rawValue) return fallback;
  try {
    const parsed = JSON.parse(rawValue);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function readStorage(key, fallback) {
  try {
    return parseStoredJson(localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

export function normalizarTexto(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .trim();
}

export function compareNormalizedPtBr(a, b) {
  return PT_BR_COLLATOR.compare(normalizarTexto(a), normalizarTexto(b));
}

export function corrigirOrtografiaUI(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  for (const [pattern, replacement] of ORTHOGRAPHY_SUBSTITUTIONS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

export function formatarTamanhoUI(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const liters = text.match(LITERS_UI_REGEX);
  if (liters) return `${liters[1]} Litro`;
  return text.toUpperCase();
}

export function tamanhoOrdenacao(value) {
  const normalized = normalizarTexto(value);
  const match = normalized.match(SIZE_REGEX);
  if (!match) return [9, normalized];

  const number = Number(match[1]);
  const unit = match[2];
  if (unit === "kg") return [0, number * 1000];
  if (unit === "g") return [0, number];
  if (unit === "l") return [1, number * 1000];
  if (unit === "ml") return [1, number];
  if (unit === "un") return [2, number];
  return [9, normalized];
}

export function uniqueNonEmpty(values) {
  return Array.from(new Set(values)).filter(Boolean);
}

export function limparTipoArroz(productName, variantLabel) {
  const produtoNormalizado = normalizarTexto(productName);
  const rotulo = String(variantLabel || "").trim();
  if (!rotulo) return "";
  if (!produtoNormalizado.includes("arroz")) return rotulo;
  return rotulo.replace(/\btipo\s*\d+\b/gi, "").replace(/\s{2,}/g, " ").trim();
}

export function regraPossuiProduto(regra) {
  return (regra?.products || []).length > 0;
}

export function regraCombinaProduto(regra, nomeProdutoNormalizado) {
  if (!nomeProdutoNormalizado) return false;
  const matchByPrefix = (value, prefix) =>
    value === prefix || value.startsWith(`${prefix} `) || value.startsWith(`${prefix}-`);

  return (regra?.products || []).some((item) => {
    const produtoRegra = normalizarTexto(item);
    return (
      produtoRegra === nomeProdutoNormalizado ||
      matchByPrefix(nomeProdutoNormalizado, produtoRegra) ||
      matchByPrefix(produtoRegra, nomeProdutoNormalizado)
    );
  });
}

export function loadStoredTokens() {
  return readStorage(STORAGE_KEY, null);
}

export function saveStoredTokens(tokens) {
  try {
    if (!tokens) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // ignore storage write errors
  }
}

export function loadStoredTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // ignore and fallback
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function loadCatalogUsageHistory() {
  const history = readStorage(CATALOG_USAGE_STORAGE_KEY, {});
  return history && typeof history === "object" ? history : {};
}

export function saveCatalogUsageHistory(history) {
  try {
    localStorage.setItem(CATALOG_USAGE_STORAGE_KEY, JSON.stringify(history || {}));
  } catch {
    // ignore storage write errors
  }
}

export function formatCurrency(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

export function formatDateTimePtBr(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

export function parseApiErrorMessage(body, fallbackMessage = "Nao foi possivel concluir a requisicao.") {
  if (typeof body?.detail === "string") return body.detail;
  const firstError = getFirstApiErrorValue(body);
  if (firstError) return firstError;
  return fallbackMessage;
}

export async function requestJson(path, options = {}) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorMessage(body));
  }
  return body;
}

