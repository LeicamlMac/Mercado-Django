import unicodedata


CATEGORY_ORDER = [
    "Mercearia",
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
}

PRODUCT_CATEGORY_RULES = [
    ("Massas e Graos", ["arroz", "feijao", "macarrao", "farinha", "grao", "lentilha"]),
    ("Bebidas", ["refrigerante", "suco", "agua", "cerveja", "energetico"]),
    ("Laticinios", ["leite", "iogurte", "queijo", "requeijao", "manteiga"]),
    ("Carnes e Aves", ["carne", "frango", "peixe", "linguica", "suina", "bovina"]),
    ("Doces e Biscoitos", ["chocolate", "biscoito", "bala", "bombom", "doce"]),
    ("Higiene Pessoal", ["sabonete", "shampoo", "desodorante", "creme dental"]),
    ("Limpeza", ["detergente", "sabao", "amaciante", "desinfetante", "agua sanitaria"]),
    ("Padaria", ["pao", "bolo", "biscoito salgado", "torrada"]),
    ("Congelados", ["congelado", "hamburguer", "nuggets", "lasanha"]),
    ("Hortifruti", ["banana", "maca", "tomate", "batata", "cebola", "alface"]),
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

    return "Mercearia"
