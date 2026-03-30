import unicodedata

DEFAULT_CATEGORY = "Mercearia"


CATEGORY_ORDER = [
    DEFAULT_CATEGORY,
    "Massas e Graos",
    "Bebidas",
    "Laticinios",
    "Carnes e Aves",
    "Doces e Biscoitos",
    "Higiene Pessoal",
    "Limpeza",
    "Padaria",
    "Congelados",
    "Hortifruti",
    "Frios e Embutidos",
    "Pets",
    "Bebe",
    "Farmacia",
    "Utilidades",
    "Granel",
]

ALLOWED_CATEGORIES = set(CATEGORY_ORDER)

DEPARTMENT_TO_CATEGORY = {
    "Mercearia": "Mercearia",
    "Laticinios": "Laticinios",
    "Bebidas": "Bebidas",
    "Carnes": "Carnes e Aves",
    "Doces": "Doces e Biscoitos",
    "Higiene": "Higiene Pessoal",
    "Higiene Pessoal": "Higiene Pessoal",
    "Limpeza": "Limpeza",
    "Padaria": "Padaria",
    "Congelados": "Congelados",
    "Hortifruti": "Hortifruti",
    "Frios": "Frios e Embutidos",
    "Pet Shop": "Pets",
    "Bebe": "Bebe",
    "Farmacia": "Farmacia",
    "Utilidades": "Utilidades",
    "Granel": "Granel",
}

PRODUCT_CATEGORY_RULES = [
    (
        "Massas e Graos",
        [
            "arroz",
            "feijao",
            "macarrao",
            "farinha",
            "grao",
            "lentilha",
            "extrato",
            "molho de tomate",
            "milho verde",
            "ervilha",
            "atum",
            "sardinha",
            "vinagre",
            "maionese",
            "ketchup",
            "mostarda",
            "sal",
            "cafe",
            "shoyu",
            "tempero",
            "pimenta",
            "paprica",
            "oregano",
            "cumino",
            "acafrao",
            "coloral",
            "canela",
            "noz moscada",
            "salsa",
            "cebolinha",
            "azeite",
            "farinha de mandioca",
            "fuba",
            "amido de milho",
            "fermento",
            "gelatina",
            "leite de coco",
            "molho ingles",
            "molho de ostra",
            "barbecue",
        ],
    ),
    (
        "Bebidas",
        ["refrigerante", "suco", "agua", "cerveja", "energetico", "isotonico", "agua de coco"],
    ),
    (
        "Laticinios",
        [
            "leite",
            "iogurte",
            "queijo",
            "requeijao",
            "manteiga",
            "creme de leite",
            "leite condensado",
            "margarina",
        ],
    ),
    ("Carnes e Aves", ["carne", "frango", "peixe", "linguica", "suina", "bovina"]),
    ("Doces e Biscoitos", ["chocolate", "biscoito", "bala", "bombom", "doce"]),
    ("Higiene Pessoal", ["sabonete", "shampoo", "desodorante", "creme dental"]),
    ("Limpeza", ["detergente", "sabao", "amaciante", "desinfetante", "agua sanitaria"]),
    ("Padaria", ["pao", "bolo", "biscoito salgado", "torrada", "pao de forma"]),
    (
        "Frios e Embutidos",
        [
            "presunto",
            "mussarela fatiada",
            "queijo prato fatiado",
            "mortadela",
            "peito de peru",
            "salame",
            "salsicha",
            "bacon",
        ],
    ),
    (
        "Pets",
        [
            "racao cachorro",
            "racao gato",
            "sache",
            "areia gato",
            "petisco cachorro",
            "petisco gato",
            "tapete higienico",
        ],
    ),
    ("Bebe", ["fralda", "lenco umedecido", "formula infantil", "pomada assadura", "papinha"]),
    (
        "Farmacia",
        ["analgesico", "antigripal", "vitamina", "antialergico", "antisseptico", "gaze", "curativo"],
    ),
    (
        "Utilidades",
        ["saco de lixo", "papel aluminio", "filme pvc", "filtro de cafe", "vela", "fosforo", "guardanapo"],
    ),
    (
        "Granel",
        ["arroz 5kg", "arroz 10kg", "feijao 5kg", "acucar 5kg", "farinha 5kg", "oleo caixa", "fardo"],
    ),
    (
        "Congelados",
        [
            "congelado",
            "hamburguer",
            "nuggets",
            "lasanha",
            "sorvete",
            "picole",
            "acai",
            "pizza",
            "batata congelada",
            "polpa",
        ],
    ),
    (
        "Hortifruti",
        [
            "banana",
            "maca",
            "tomate",
            "batata",
            "cebola",
            "alface",
            "cenoura",
            "pepino",
            "abobrinha",
            "brocolis",
            "couve",
            "repolho",
            "mamao",
            "laranja",
            "uva",
            "manga",
            "abacaxi",
            "melancia",
            "melao",
            "verdura",
            "legume",
            "fruta",
            "hortifruti",
            "cheiro verde",
        ],
    ),
]


def normalize_text(value: str) -> str:
    cleaned = (value or "").strip().lower()
    normalized = unicodedata.normalize("NFD", cleaned)
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def resolve_category_name(
    product_name: str = "",
    department_names: list[str] | None = None,
    requested_category: str = "",
) -> str:
    requested = (requested_category or "").strip().title()
    if requested in ALLOWED_CATEGORIES:
        return requested

    normalized_product = normalize_text(product_name)
    for category, keywords in PRODUCT_CATEGORY_RULES:
        if any(keyword in normalized_product for keyword in keywords):
            return category

    for name in department_names or []:
        mapped = DEPARTMENT_TO_CATEGORY.get((name or "").strip().title())
        if mapped:
            return mapped

    return DEFAULT_CATEGORY
