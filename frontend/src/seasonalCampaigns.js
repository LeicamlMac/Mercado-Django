export const FESTIVAL_CALENDAR = [
  {
    id: "carnaval",
    name: "Carnaval",
    months: [2, 3],
    description: "Foco em bebidas, gelo e snacks para giro rápido.",
    keywords: ["cerveja", "refrigerante", "energetico", "gelo", "salgadinho"],
  },
  {
    id: "pascoa",
    name: "Páscoa",
    months: [3, 4],
    description: "Aumente cobertura de chocolates e itens sazonais.",
    keywords: ["ovo de pascoa", "chocolate", "bombom", "pacoca"],
  },
  {
    id: "junina",
    name: "Festa Junina",
    months: [6, 7],
    description: "Produtos típicos de arraial e mercearia sazonal.",
    keywords: ["milho", "amendoim", "paçoca", "canjica", "polvilho"],
  },
  {
    id: "inverno",
    name: "Inverno",
    months: [6, 7, 8],
    description: "Bebidas quentes e itens de conforto com bom giro.",
    keywords: ["cafe", "chocolate", "sopa", "cha", "vinho"],
  },
  {
    id: "criancas",
    name: "Dia das Crianças",
    months: [9, 10],
    description: "Doces, snacks e itens de consumo infantil.",
    keywords: ["bala", "chocolate", "salgadinho", "biscoito recheado"],
  },
  {
    id: "natal",
    name: "Natal",
    months: [11, 12],
    description: "Prepare mix natalino com antecedência.",
    keywords: ["panetone", "peru inteiro", "chester inteiro", "vinho", "espumante"],
  },
  {
    id: "ano_novo",
    name: "Ano Novo",
    months: [12, 1],
    description: "Bebidas e congelados para alta procura no réveillon.",
    keywords: ["espumante", "vinho", "whisky", "refrigerante", "gelo"],
  },
];

export function buildSeasonalCampaigns(currentMonth) {
  return FESTIVAL_CALENDAR.map((campaign) => ({
    ...campaign,
    activeNow: campaign.months.includes(currentMonth),
  }));
}

export function getCurrentMonthLabel(date = new Date()) {
  const raw = date.toLocaleDateString("pt-BR", { month: "long" });
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
}
