import json
import re
import unicodedata
import urllib.parse
import urllib.request
from dataclasses import dataclass

from django.conf import settings


BLUESOFT_BASE_URL = "https://api.cosmos.bluesoft.com.br"


@dataclass
class CatalogItem:
    barcode: str
    product_name: str
    brand: str
    category: str
    variant_label: str
    package_size: str
    department_names: list[str]
    source: str


def _normalize_text(value: str) -> str:
    return (value or "").strip()


def _normalize_for_match(value: str) -> str:
    cleaned = (value or "").strip().lower()
    normalized = unicodedata.normalize("NFD", cleaned)
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def _token() -> str:
    return (getattr(settings, "BLUESOFT_COSMOS_TOKEN", "") or "").strip()


def _agent() -> str:
    return (getattr(settings, "BLUESOFT_COSMOS_USER_AGENT", "") or "").strip()


def _is_configured() -> bool:
    return bool(_token() and _agent())


def _infer_departments(raw_text: str) -> list[str]:
    text = _normalize_for_match(raw_text)
    mapping = [
        ("Bebidas", ["bebida", "refrigerante", "suco", "agua", "cha", "energetico", "cerveja"]),
        ("Laticinios", ["leite", "iogurte", "queijo", "requeijao", "manteiga"]),
        ("Doces", ["doce", "chocolate", "biscoito", "bala", "bombom", "paçoca", "pacoca"]),
        (
            "Higiene Pessoal",
            ["sabonete", "shampoo", "condicionador", "desodorante", "creme dental", "escova"],
        ),
        (
            "Carnes",
            [
                "carne",
                "frango",
                "bovina",
                "suina",
                "peixe",
                "linguica",
                "picanha",
                "alcatra",
                "patinho",
                "costela",
                "lombo",
                "pernil",
            ],
        ),
        ("Mercearia", ["arroz", "feijao", "macarrao", "farinha", "oleo", "acucar", "sal"]),
    ]
    result = [name for name, terms in mapping if any(term in text for term in terms)]
    return result or ["Mercearia"]


def _infer_variant(description: str) -> str:
    text = _normalize_for_match(description)
    tokens = [
        "integral",
        "desnatado",
        "semidesnatado",
        "parboilizado",
        "branco",
        "zero",
        "sem gas",
        "com gas",
        "diet",
        "light",
    ]
    for token in tokens:
        if token in text:
            return token.title()
    return "Tradicional"


def _extract_size(description: str, net_weight: int | float | None = None) -> str:
    if net_weight and net_weight > 0:
        weight = float(net_weight)
        if weight >= 1000 and weight % 1000 == 0:
            return f"{int(weight / 1000)}KG"
        return f"{int(weight)}G"

    match = re.search(r"(\d+(?:[.,]\d+)?)\s?(ML|L|G|KG)", (description or "").upper())
    if match:
        value = match.group(1).replace(",", ".")
        unit = match.group(2)
        if value.endswith(".0"):
            value = value[:-2]
        return f"{value}{unit}"
    return "1UN"


def _request_json(path: str, params: dict | None = None) -> dict:
    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    url = f"{BLUESOFT_BASE_URL}{path}{query}"
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": _agent(),
            "Content-Type": "application/json",
            "X-Cosmos-Token": _token(),
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=12) as response:
        return json.loads(response.read().decode("utf-8"))


def _extract_name(description: str) -> str:
    text = _normalize_text(description)
    if not text:
        return ""
    return text.split(" - ")[0].title()


def _as_catalog_item(row: dict, fallback_barcode: str = "") -> CatalogItem | None:
    description = _normalize_text(row.get("description") or row.get("name"))
    if not description:
        return None

    brand_raw = row.get("brand")
    if isinstance(brand_raw, dict):
        brand_name = _normalize_text(brand_raw.get("name"))
    else:
        brand_name = _normalize_text(brand_raw)
    brand_name = brand_name or "Sem Marca"

    gpc = row.get("gpc") or {}
    gpc_description = _normalize_text(gpc.get("description")) if isinstance(gpc, dict) else ""
    category = gpc_description or "Mercearia"

    barcode = str(row.get("gtin") or row.get("ean") or fallback_barcode or "").strip()
    if barcode.endswith(".0"):
        barcode = barcode[:-2]

    size = _extract_size(description, row.get("net_weight"))

    return CatalogItem(
        barcode=barcode,
        product_name=_extract_name(description),
        brand=brand_name.title(),
        category=category.title(),
        variant_label=_infer_variant(description),
        package_size=size,
        department_names=_infer_departments(f"{description} {gpc_description}"),
        source="bluesoft_cosmos",
    )


def lookup_by_barcode(barcode: str) -> CatalogItem | None:
    if not _is_configured():
        return None
    code = "".join(char for char in (barcode or "") if char.isdigit())
    if not code:
        return None
    payload = _request_json(f"/gtins/{urllib.parse.quote(code)}.json")
    return _as_catalog_item(payload, fallback_barcode=code)


def search_by_name(query: str, page_size: int = 40) -> list[CatalogItem]:
    if not _is_configured():
        return []
    term = (query or "").strip()
    if len(term) < 2:
        return []

    rows = []
    for page in (1, 2):
        payload = _request_json(
            "/products",
            params={"query": term, "per_page": page_size, "page": page},
        )
        page_rows = (
            payload.get("products")
            or payload.get("data")
            or payload.get("items")
            or payload.get("results")
            or []
        )
        if not page_rows:
            break
        rows.extend(page_rows)
    result: list[CatalogItem] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        if isinstance(row.get("product"), dict):
            row = row["product"]
        item = _as_catalog_item(row)
        if item:
            result.append(item)
    return result


def bluesoft_is_configured() -> bool:
    return _is_configured()
