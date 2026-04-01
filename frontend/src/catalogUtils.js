export const STORAGE_KEY = "mercado_auth_tokens";
export const THEME_STORAGE_KEY = "mercado_theme";
export const CATALOG_USAGE_STORAGE_KEY = "mercado_catalog_usage_v1";
export const DEFAULT_ORDERING = "product__name,product__brand,variant_label,package_size";

export const ORDERING_OPTIONS = [
  { value: "product__name,product__brand,variant_label,package_size", label: "Produto (A-Z)" },
  { value: "-product__name,-product__brand,-variant_label,-package_size", label: "Produto (Z-A)" },
  { value: "-updated_at", label: "Atualizados recentemente" },
  { value: "-price", label: "Maior preÃ§o" },
  { value: "price", label: "Menor preÃ§o" },
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
  RETURN: "DevoluÃ§Ã£o",
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
const ORTHOGRAPHY_SUBSTITUTIONS = [
  [/Laticinios/gi, "Laticínios"],
  [/Higienico/gi, "Higiênico"],
  [/Acucar/gi, "Açúcar"],
  [/Cafe/gi, "Café"],
  [/Limao/gi, "Limão"],
  [/Maracuja/gi, "Maracujá"],
  [/Pao/gi, "Pão"],
  [/Sabao em Po/gi, "Sabão em Pó"],
  [/Sabao/gi, "Sabão"],
  [/Agua Sanitaria/gi, "Água Sanitária"],
  [/Agua/gi, "Água"],
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
  [/Pao de Queijo/gi, "Pão de Queijo"],
  [/Pao de Alho/gi, "Pão de Alho"],
  [/Ovo de Pascoa/gi, "Ovo de Páscoa"],
  [/\bCha\b/gi, "Chá"],
  [/Cafe Soluvel/gi, "Café Solúvel"],
  [/Bebe/gi, "Bebê"],
  [/Farmacia/gi, "Farmácia"],
  [/ElegÃª/gi, "Elege"],
  [/Feijao-de-corda/gi, "Feijão-de-corda"],
  [/Feijao/gi, "Feijão"],
  [/Parboilizado/gi, "Parboilizado"],
];

export function normalizarTexto(value) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
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
  const litro = text.match(/^(\d+(?:[.,]\d+)?)\s*L$/i);
  if (litro) return `${litro[1]} Litro`;
  return text.toUpperCase();
}

export function tamanhoOrdenacao(value) {
  const text = normalizarTexto(value);
  const match = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|un)$/i);
  if (!match) return [9, text];
  const number = Number(match[1]);
  const unit = match[2];
  if (unit === "kg") return [0, number * 1000];
  if (unit === "g") return [0, number];
  if (unit === "l") return [1, number * 1000];
  if (unit === "ml") return [1, number];
  if (unit === "un") return [2, number];
  return [9, text];
}

export function uniqueNonEmpty(values) {
  return Array.from(new Set(values)).filter(Boolean);
}

export function limparTipoArroz(productName, variantLabel) {
  const produto = normalizarTexto(productName);
  const rotulo = (variantLabel || "").trim();
  if (!rotulo) return "";
  if (!produto.includes("arroz")) return rotulo;
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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveStoredTokens(tokens) {
  if (!tokens) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
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
  try {
    const raw = localStorage.getItem(CATALOG_USAGE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCatalogUsageHistory(history) {
  try {
    localStorage.setItem(CATALOG_USAGE_STORAGE_KEY, JSON.stringify(history || {}));
  } catch {
    // Ignore storage write errors in browsers with restricted storage.
  }
}

export function formatCurrency(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

export function formatDateTimePtBr(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

export async function requestJson(path, options = {}) {
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
    throw new Error("Nao foi possivel concluir a requisicao.");
  }

  return body;
}

