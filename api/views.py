import re
from django.contrib.auth.models import Group

from django.db import transaction
from django.db.models import Count, F, Prefetch, Q, Sum, Value
from django.db.models.functions import Lower, Replace
from rest_framework import filters, status, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .constants import ALLOWED_DEPARTMENTS, DEPARTMENT_ORDER
from .models import (
    Category,
    Department,
    ProductBase,
    ProductPackage,
    ProductVariant,
    StockMovement,
)
from .permissions import CatalogWritePermission
from .serializers import (
    AdjustStockSerializer,
    CategorySerializer,
    DepartmentSerializer,
    PackageMovementActionSerializer,
    ProductBaseSerializer,
    ProductPackageSerializer,
    ProductVariantSerializer,
    QuickEntrySerializer,
    StockMovementSerializer,
)
from .services.catalog_provider import bluesoft_is_configured, lookup_by_barcode, search_by_name
from .services.local_catalog import (
    get_local_product_rules,
    lookup_local_by_barcode,
    search_local_catalog,
)
from .services.taxonomy import (
    ALLOWED_CATEGORIES,
    CATEGORY_ORDER,
    normalize_text as normalize_catalog_text,
    resolve_category_name,
)

REFRIGERANTE_BRANDS = {
    "coca-cola",
    "coca cola",
    "guarana antarctica",
    "fanta",
    "pepsi",
    "sprite",
    "kuat",
    "dolly",
}
SUCO_BRANDS = {
    "del valle",
    "maguary",
    "tial",
    "natural one",
    "do bem",
    "sufresh",
    "dafruta",
}
AGUA_BRANDS = {
    "crystal",
    "minalba",
    "bonafont",
    "indaia",
    "lindoya",
    "acquissima",
}
REFRI_BRAND_VARIANT_HINTS = {
    "coca-cola": {"cola", "zero"},
    "coca cola": {"cola", "zero"},
    "pepsi": {"cola", "zero"},
    "sprite": {"limao", "zero"},
    "fanta": {"laranja", "uva", "limao", "zero"},
    "guarana antarctica": {"guarana", "zero"},
    "kuat": {"guarana", "zero"},
    "dolly": {"guarana", "cola", "uva", "laranja", "zero"},
}

CATALOG_STOCK_SEARCH_LIMIT = 400
CATALOG_LOCAL_SEARCH_LIMIT = 400
BEER_BRANDS = {
    "skol",
    "brahma",
    "antarctica",
    "heineken",
    "amstel",
    "itaipava",
    "petra",
    "budweiser",
    "stella artois",
}

QUERY_SYNONYMS = {
    "zero": ["sem", "acucar", "lactose"],
    "sem": ["zero"],
    "acucar": ["zero", "diet"],
    "diet": ["zero", "sem", "acucar"],
    "lactose": ["zero"],
    "garrafao": ["agua", "mineral", "20l", "10l"],
    "açucar": ["acucar"],
    "açai": ["acai", "acai"],
    "acai": ["açai", "açai"],
    "refri": ["refrigerante"],
    "refrigerante": ["refri"],
    "pipoca": ["microondas", "milho"],
}

ACTIVE_PACKAGES_PREFETCH = Prefetch(
    "packages",
    queryset=ProductPackage.objects.filter(is_active=True).only(
        "id",
        "variant_id",
        "name",
        "units_per_package",
        "is_default",
        "is_active",
    ),
)

DEPARTMENT_NAMES_PREFETCH = Prefetch(
    "product__departments",
    queryset=Department.objects.only("id", "name"),
)

PTBR_REPLACEMENTS = (
    ("ç", "c"),
    ("á", "a"),
    ("à", "a"),
    ("â", "a"),
    ("ã", "a"),
    ("ä", "a"),
    ("é", "e"),
    ("è", "e"),
    ("ê", "e"),
    ("ë", "e"),
    ("í", "i"),
    ("ì", "i"),
    ("î", "i"),
    ("ï", "i"),
    ("ó", "o"),
    ("ò", "o"),
    ("ô", "o"),
    ("õ", "o"),
    ("ö", "o"),
    ("ú", "u"),
    ("ù", "u"),
    ("û", "u"),
    ("ü", "u"),
)


def _signed_units(movement_type, units):
    if movement_type in {StockMovement.MOVEMENT_RECEIVE, StockMovement.MOVEMENT_RETURN}:
        return units
    if movement_type in {StockMovement.MOVEMENT_SELL, StockMovement.MOVEMENT_LOSS}:
        return -units
    return units


def _ptbr_sort_expr(field_name):
    expr = Lower(F(field_name))
    for source, target in PTBR_REPLACEMENTS:
        expr = Replace(expr, Value(source), Value(target))
    return expr


def _resolve_units(payload, variant):
    package = None
    package_name = payload.get("package_name")
    package_id = payload.get("package_id")
    quantity_units = payload.get("quantity_units")
    package_quantity = payload.get("package_quantity", 1)

    if package_id:
        package = ProductPackage.objects.filter(id=package_id, variant=variant).first()
    elif package_name:
        package = ProductPackage.objects.filter(
            variant=variant, name__iexact=package_name.strip()
        ).first()

    if package:
        units = package.units_per_package * package_quantity
        return package, units, package_quantity

    if quantity_units:
        return None, quantity_units, 1

    return None, 0, 1


def _normalize_for_search(value: str) -> str:
    normalized = normalize_catalog_text(value or "")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def _query_tokens(value: str) -> list[str]:
    text = _normalize_for_search(value)
    return [token for token in text.split(" ") if token]


def _expand_query_tokens(tokens: list[str]) -> list[str]:
    expanded = []
    seen = set()
    for token in tokens:
        if token not in seen:
            expanded.append(token)
            seen.add(token)
        for extra in QUERY_SYNONYMS.get(token, []):
            normalized_extra = _normalize_for_search(extra)
            if not normalized_extra or normalized_extra in seen:
                continue
            expanded.append(normalized_extra)
            seen.add(normalized_extra)
    return expanded


def _distance_lte_one(a: str, b: str) -> bool:
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    i = 0
    j = 0
    edits = 0
    while i < len(a) and j < len(b):
        if a[i] == b[j]:
            i += 1
            j += 1
            continue
        edits += 1
        if edits > 1:
            return False
        if len(a) > len(b):
            i += 1
        elif len(b) > len(a):
            j += 1
        else:
            i += 1
            j += 1
    if i < len(a) or j < len(b):
        edits += 1
    return edits <= 1


def _token_matches_haystack(token: str, haystack_tokens: list[str]) -> bool:
    for candidate in haystack_tokens:
        if token == candidate:
            return True
        if token in candidate or candidate in token:
            return True
        if _distance_lte_one(token, candidate):
            return True
    return False


def _score_catalog_entry(query_text: str, query_tokens: list[str], item: dict) -> int:
    product = _normalize_for_search(item.get("product_name") or "")
    brand = _normalize_for_search(item.get("brand") or "")
    category = _normalize_for_search(item.get("category") or "")
    variant = _normalize_for_search(item.get("variant_label") or "")
    size = _normalize_for_search(item.get("package_size") or "")
    source = _normalize_for_search(item.get("source") or "")
    haystack = " ".join([product, brand, category, variant, size]).strip()
    haystack_tokens = [token for token in haystack.split(" ") if token]

    score = 0
    if query_text:
        if product == query_text:
            score += 220
        if brand == query_text:
            score += 160
        if variant == query_text:
            score += 130
        if product.startswith(query_text):
            score += 95
        if brand.startswith(query_text):
            score += 80
        if query_text in product:
            score += 70
        if query_text in variant:
            score += 55
        if query_text in haystack:
            score += 30

    for token in query_tokens:
        if _token_matches_haystack(token, haystack_tokens):
            score += 18

    if source == "estoque_local":
        score += 24
    elif source == "catalogo_local_br":
        score += 16
    return score


def _size_sort_tuple(value: str):
    text = _normalize_for_search(value)
    match = re.search(r"(\d+(?:\.\d+)?)\s*(kg|g|l|ml|un)$", text)
    if not match:
        return (9, text)
    number = float(match.group(1))
    unit = match.group(2)
    if unit == "kg":
        return (0, number * 1000.0)
    if unit == "g":
        return (0, number)
    if unit == "l":
        return (1, number * 1000.0)
    if unit == "ml":
        return (1, number)
    if unit == "un":
        return (2, number)
    return (9, text)


def _search_stock_catalog(query: str, department: str = "", limit: int = CATALOG_STOCK_SEARCH_LIMIT):
    term = (query or "").strip()
    if len(term) < 2:
        return []
    normalized_term = _normalize_for_search(term)
    base_tokens = _query_tokens(term)
    tokens = _expand_query_tokens(base_tokens)

    queryset = (
        ProductVariant.objects.select_related("product", "product__category")
        .prefetch_related(DEPARTMENT_NAMES_PREFETCH, ACTIVE_PACKAGES_PREFETCH)
        .filter(is_active=True)
    )
    if department:
        queryset = queryset.filter(product__departments__name__iexact=department.strip())

    queryset = queryset.distinct()

    items = []

    def _brand_matches(brand_value: str, allowed_terms: set[str]) -> bool:
        return any(term in brand_value for term in allowed_terms)

    # We intentionally scan in Python to support accent-insensitive matching
    # (e.g. "aço" finds "Aco"/"Aço") regardless of database collation.
    scan_limit = max(limit * 20, 10000)
    for variant in queryset.order_by("-updated_at")[:scan_limit]:
        normalized_product = _normalize_for_search(variant.product.name)
        normalized_brand = _normalize_for_search(variant.product.brand)
        normalized_category = _normalize_for_search(variant.product.category.name)
        normalized_variant = _normalize_for_search(variant.variant_label)
        normalized_size = _normalize_for_search(variant.package_size)

        haystack = " ".join(
            [
                normalized_product,
                normalized_brand,
                normalized_category,
                normalized_variant,
                normalized_size,
            ]
        ).strip()
        haystack_tokens = [token for token in haystack.split(" ") if token]
        if base_tokens and not all(_token_matches_haystack(token, haystack_tokens) for token in base_tokens):
            continue

        # For high-intent beverage queries, prioritize exact product families.
        if normalized_term in {"refri", "refrigerante"} and "refrigerante" not in normalized_product:
            continue
        if normalized_term == "suco" and "suco" not in normalized_product:
            continue
        if normalized_term == "agua" and "agua" not in normalized_product:
            continue

        # Avoid implausible product-brand combinations in assistant search.
        if ("refri" in normalized_product or "refrigerante" in normalized_product) and not _brand_matches(normalized_brand, REFRIGERANTE_BRANDS):
            continue
        if "suco" in normalized_product and not _brand_matches(normalized_brand, SUCO_BRANDS):
            continue
        if ("agua" in normalized_product or "água" in normalized_product) and not _brand_matches(normalized_brand, AGUA_BRANDS):
            continue
        if normalized_product == "refri":
            continue
        if "cerveja" in normalized_product and not _brand_matches(normalized_brand, BEER_BRANDS):
            continue
        if "refri" in normalized_product or "refrigerante" in normalized_product:
            variant_ok = True
            for brand_hint, allowed_variants in REFRI_BRAND_VARIANT_HINTS.items():
                if brand_hint in normalized_brand and normalized_variant:
                    if not any(hint in normalized_variant for hint in allowed_variants):
                        variant_ok = False
                    break
            if not variant_ok:
                continue

        default_package = None
        for package in variant.packages.all():
            if package.is_default:
                default_package = package
                break
        if default_package is None:
            default_package = next(iter(variant.packages.all()), None)

        items.append(
            {
                "barcode": "",
                "product_name": variant.product.name,
                "brand": variant.product.brand,
                "category": variant.product.category.name,
                "variant_label": variant.variant_label,
                "package_size": variant.package_size,
                "department_names": [dep.name for dep in variant.product.departments.all()],
                "package_name": default_package.name if default_package else "UNIDADE",
                "package_units": default_package.units_per_package if default_package else 1,
                "source": "estoque_local",
                "_stock": variant.stock,
            }
        )
    for item in items:
        item["_score"] = _score_catalog_entry(normalized_term, tokens, item)
    items.sort(
        key=lambda item: (
            item.get("_score", 0),
            item.get("_stock", 0),
            -_size_sort_tuple(item.get("package_size") or "")[0],
        ),
        reverse=True,
    )
    return items[:limit]


def _resolve_product_base(category, product_name, brand):
    normalized_name = product_name.strip().title()
    normalized_brand = brand.strip().title()

    exact = ProductBase.objects.filter(
        category=category,
        name__iexact=normalized_name,
        brand__iexact=normalized_brand,
    ).first()
    if exact:
        return exact, False

    legacy = (
        ProductBase.objects.filter(name__iexact=normalized_name, brand__iexact=normalized_brand)
        .order_by("-updated_at", "-id")
        .first()
    )
    if legacy:
        if legacy.category_id != category.id:
            legacy.category = category
            legacy.save(update_fields=["category", "updated_at"])
        return legacy, False

    created = ProductBase.objects.create(
        category=category,
        name=normalized_name,
        brand=normalized_brand,
        is_active=True,
    )
    return created, True


def _resolve_variant(product, variant_label, package_size, price):
    normalized_variant = variant_label.strip().title()
    normalized_size = package_size.strip().upper()

    variant = ProductVariant.objects.filter(
        product=product,
        variant_label__iexact=normalized_variant,
        package_size__iexact=normalized_size,
    ).first()
    if variant:
        variant.price = price
        variant.is_active = True
        variant.save(update_fields=["price", "is_active", "updated_at"])
        return variant, False

    created = ProductVariant.objects.create(
        product=product,
        variant_label=normalized_variant,
        package_size=normalized_size,
        price=price,
        stock=0,
        is_active=True,
    )
    return created, True


def _resolve_or_create_package(variant, package_name, package_units, *, allow_update_units=False):
    normalized_name = package_name.strip().upper()
    units = int(package_units or 1)

    package = ProductPackage.objects.filter(
        variant=variant,
        name__iexact=normalized_name,
    ).first()
    if package:
        if allow_update_units and units != package.units_per_package:
            package.units_per_package = units
            package.save(update_fields=["units_per_package", "updated_at"])
        return package, False

    created = ProductPackage.objects.create(
        variant=variant,
        name=normalized_name,
        units_per_package=units,
        is_default=normalized_name == "UNIDADE",
    )
    return created, True


@transaction.atomic
def _apply_movement(variant, movement_type, units, user, notes="", package=None, package_quantity=1):
    signed = _signed_units(movement_type, units)

    variant.refresh_from_db(fields=["stock"])
    if variant.stock + signed < 0:
        raise ValueError("O estoque não pode ficar negativo.")

    ProductVariant.objects.filter(id=variant.id).update(stock=F("stock") + signed)
    variant.refresh_from_db()

    movement = StockMovement.objects.create(
        variant=variant,
        movement_type=movement_type,
        package=package,
        package_quantity=package_quantity,
        units_delta=signed,
        notes=notes,
        created_by=user if user.is_authenticated else None,
    )
    return movement, variant


class HealthCheckView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok", "service": "mercado-api"})


class CategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CatalogWritePermission]
    serializer_class = CategorySerializer
    queryset = Category.objects.all()
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at", "updated_at"]
    ordering = ["name"]

    def get_queryset(self):
        return Category.objects.filter(name__in=ALLOWED_CATEGORIES).order_by(Lower("name"))


class DepartmentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CatalogWritePermission]
    serializer_class = DepartmentSerializer
    queryset = Department.objects.filter(name__in=ALLOWED_DEPARTMENTS).all()
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at", "updated_at"]
    ordering = ["name"]

    def get_queryset(self):
        return (
            Department.objects.filter(name__in=ALLOWED_DEPARTMENTS)
            .order_by(Lower("name"))
            .all()
        )


class ProductBaseViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CatalogWritePermission]
    serializer_class = ProductBaseSerializer
    queryset = ProductBase.objects.select_related("category").prefetch_related("departments").all()
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "brand", "category__name", "departments__name"]
    ordering_fields = ["name", "brand", "created_at", "updated_at"]
    ordering = ["name", "brand"]

    def get_queryset(self):
        queryset = super().get_queryset()
        category_id = self.request.query_params.get("category_id")
        department_id = self.request.query_params.get("department_id")
        if category_id:
            queryset = queryset.filter(category_id=category_id)
        if department_id:
            queryset = queryset.filter(departments__id=department_id)
        return queryset.distinct()


class ProductPackageViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CatalogWritePermission]
    serializer_class = ProductPackageSerializer
    queryset = ProductPackage.objects.select_related("variant", "variant__product").all()
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "variant__product__name", "variant__product__brand"]
    ordering_fields = ["name", "units_per_package", "updated_at"]
    ordering = ["units_per_package", "name"]

    def get_queryset(self):
        queryset = super().get_queryset()
        variant_id = self.request.query_params.get("variant_id")
        if variant_id:
            queryset = queryset.filter(variant_id=variant_id)
        return queryset


class ProductVariantViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CatalogWritePermission]
    serializer_class = ProductVariantSerializer
    queryset = (
        ProductVariant.objects.select_related("product", "product__category")
        .prefetch_related("packages", "product__departments")
        .all()
    )
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "product__name",
        "product__brand",
        "product__category__name",
        "product__departments__name",
        "variant_label",
        "package_size",
    ]
    ordering_fields = [
        "product__name",
        "product__brand",
        "variant_label",
        "package_size",
        "price",
        "stock",
        "updated_at",
        "created_at",
    ]
    ordering = ["product__name", "product__brand", "variant_label", "package_size"]
    accent_insensitive_ordering_params = {
        "",
        "product__name,product__brand,variant_label,package_size",
        "-product__name,-product__brand,-variant_label,-package_size",
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        category_id = self.request.query_params.get("category_id")
        department_id = self.request.query_params.get("department_id")
        product_id = self.request.query_params.get("product_id")
        is_active = self.request.query_params.get("is_active")

        if category_id:
            queryset = queryset.filter(product__category_id=category_id)
        if department_id:
            queryset = queryset.filter(product__departments__id=department_id)
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        if is_active in {"true", "false"}:
            queryset = queryset.filter(is_active=(is_active == "true"))
        return queryset.distinct()

    def list(self, request, *args, **kwargs):
        ordering_param = (request.query_params.get("ordering") or "").strip()
        if ordering_param not in self.accent_insensitive_ordering_params:
            return super().list(request, *args, **kwargs)

        queryset = self.filter_queryset(self.get_queryset())
        prefix = "-" if ordering_param.startswith("-") else ""
        queryset = queryset.annotate(
            product_name_sort=_ptbr_sort_expr("product__name"),
            product_brand_sort=_ptbr_sort_expr("product__brand"),
            variant_label_sort=_ptbr_sort_expr("variant_label"),
            package_size_sort=_ptbr_sort_expr("package_size"),
        ).order_by(
            f"{prefix}product_name_sort",
            f"{prefix}product_brand_sort",
            f"{prefix}variant_label_sort",
            f"{prefix}package_size_sort",
            f"{prefix}id",
        )

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class ProductVariantChoicesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        is_active = (request.query_params.get("is_active") or "").strip().lower()
        raw_limit = request.query_params.get("limit") or "300"
        try:
            limit = max(50, min(int(raw_limit), 1000))
        except ValueError:
            limit = 300

        queryset = (
            ProductVariant.objects.select_related("product")
            .prefetch_related(ACTIVE_PACKAGES_PREFETCH)
            .all()
        )
        if is_active in {"true", "false"}:
            active_flag = is_active == "true"
            queryset = queryset.filter(is_active=active_flag, product__is_active=active_flag)
        if query:
            queryset = queryset.filter(
                Q(product__name__icontains=query)
                | Q(product__brand__icontains=query)
                | Q(variant_label__icontains=query)
                | Q(package_size__icontains=query)
            )

        queryset = queryset.order_by(
            Lower("product__name"),
            Lower("variant_label"),
            Lower("package_size"),
            Lower("product__brand"),
        )

        items = [
            {
                "id": variant.id,
                "label": f"{variant.product.name} {variant.variant_label or 'Padrão'} {variant.package_size} ({variant.product.brand})",
                "is_active": variant.is_active and variant.product.is_active,
                "stock": variant.stock,
                "updated_at": variant.updated_at,
                "packages": [
                    package.name
                    for package in variant.packages.all()
                    if package.is_active
                ],
            }
            for variant in queryset[:limit]
        ]
        return Response({"items": items})


class MovementPagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 200


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = StockMovementSerializer
    pagination_class = MovementPagination
    queryset = (
        StockMovement.objects.select_related("variant", "variant__product", "package")
        .only(
            "id",
            "variant_id",
            "variant__variant_label",
            "variant__product__name",
            "movement_type",
            "package_id",
            "package__name",
            "package_quantity",
            "units_delta",
            "notes",
            "created_at",
        )
        .all()
    )
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["created_at", "units_delta"]
    ordering = ["-created_at", "-id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        variant_id = self.request.query_params.get("variant_id")
        movement_type = self.request.query_params.get("movement_type")
        if variant_id:
            queryset = queryset.filter(variant_id=variant_id)
        if movement_type:
            queryset = queryset.filter(movement_type=movement_type)
        return queryset


class ProductMetricsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = ProductVariant.objects.aggregate(
            total_variants=Count("id"),
            active_variants=Count("id", filter=Q(is_active=True)),
            total_stock=Sum("stock"),
            low_stock_count=Count("id", filter=Q(stock__lt=5)),
        )
        inventory = {
            "total_variants": data.get("total_variants") or 0,
            "active_variants": data.get("active_variants") or 0,
            "total_stock": data.get("total_stock") or 0,
            "low_stock_count": data.get("low_stock_count") or 0,
        }
        return Response(
            {
                # Backward-compatible flat fields consumed by the current frontend.
                "total_variants": inventory["total_variants"],
                "active_variants": inventory["active_variants"],
                "total_stock": inventory["total_stock"],
                "low_stock_count": inventory["low_stock_count"],
                # Grouped format for progressive migration in clients.
                "inventory": inventory,
            }
        )


class QuickEntryView(APIView):
    permission_classes = [IsAuthenticated, CatalogWritePermission]

    @transaction.atomic
    def post(self, request):
        serializer = QuickEntrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        department_names = [name.strip().title() for name in data.get("department_names", []) if name.strip()]
        if not department_names:
            department_names = ["Mercearia"]

        normalized_category = resolve_category_name(
            product_name=data["product_name"],
            department_names=department_names,
            requested_category=data.get("category_name", ""),
        )
        category, _ = Category.objects.get_or_create(name=normalized_category)
        product, _ = _resolve_product_base(
            category=category,
            product_name=data["product_name"],
            brand=data["brand"],
        )
        department_ids = []
        for dep_name in department_names:
            dep, _ = Department.objects.get_or_create(name=dep_name)
            department_ids.append(dep.id)
        if department_ids:
            product.departments.add(*department_ids)

        variant, created = _resolve_variant(
            product=product,
            variant_label=data.get("variant_label", ""),
            package_size=data["package_size"],
            price=data["price"],
        )

        unit_package, _ = ProductPackage.objects.get_or_create(
            variant=variant, name="UNIDADE", defaults={"units_per_package": 1, "is_default": True}
        )
        if not unit_package.is_default:
            unit_package.is_default = True
            unit_package.save(update_fields=["is_default", "updated_at"])

        package_name = data.get("package_name", "UNIDADE").strip().upper()
        package_units = data.get("package_units")
        if package_name == "UNIDADE":
            package_units = 1
        if not package_units:
            package_units = 1

        movement_package, _ = _resolve_or_create_package(
            variant=variant,
            package_name=package_name,
            package_units=package_units,
            allow_update_units=False,
        )

        movement, variant = _apply_movement(
            variant=variant,
            movement_type=StockMovement.MOVEMENT_RECEIVE,
            units=movement_package.units_per_package * data["quantity"],
            user=request.user,
            notes="Entrada rapida",
            package=movement_package,
            package_quantity=data["quantity"],
        )

        output = ProductVariantSerializer(variant).data
        return Response(
            {
                "action": "created" if created else "restocked",
                "item": output,
                "movement": StockMovementSerializer(movement).data,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ReceiveStockView(APIView):
    permission_classes = [IsAuthenticated, CatalogWritePermission]

    def post(self, request):
        serializer = PackageMovementActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        variant = ProductVariant.objects.filter(id=data["variant_id"]).first()
        if not variant:
            return Response({"detail": "Item não encontrado."}, status=status.HTTP_404_NOT_FOUND)

        package, units, package_quantity = _resolve_units(data, variant)
        if units < 1:
            return Response(
                {"detail": "Não foi possível calcular unidades para este recebimento."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        movement, variant = _apply_movement(
            variant=variant,
            movement_type=StockMovement.MOVEMENT_RECEIVE,
            units=units,
            user=request.user,
            notes=data.get("notes", ""),
            package=package,
            package_quantity=package_quantity,
        )
        return Response(
            {
                "item": ProductVariantSerializer(variant).data,
                "movement": StockMovementSerializer(movement).data,
            }
        )


class SellStockView(APIView):
    permission_classes = [IsAuthenticated, CatalogWritePermission]

    def post(self, request):
        serializer = PackageMovementActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        variant = ProductVariant.objects.filter(id=data["variant_id"]).first()
        if not variant:
            return Response({"detail": "Item não encontrado."}, status=status.HTTP_404_NOT_FOUND)

        package, units, package_quantity = _resolve_units(data, variant)
        if units < 1:
            return Response(
                {"detail": "Não foi possível calcular unidades para esta venda."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            movement, variant = _apply_movement(
                variant=variant,
                movement_type=StockMovement.MOVEMENT_SELL,
                units=units,
                user=request.user,
                notes=data.get("notes", ""),
                package=package,
                package_quantity=package_quantity,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "item": ProductVariantSerializer(variant).data,
                "movement": StockMovementSerializer(movement).data,
            }
        )


class AdjustStockView(APIView):
    permission_classes = [IsAuthenticated, CatalogWritePermission]

    def post(self, request):
        serializer = AdjustStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        variant = ProductVariant.objects.filter(id=data["variant_id"]).first()
        if not variant:
            return Response({"detail": "Item não encontrado."}, status=status.HTTP_404_NOT_FOUND)

        units = data["quantity_units"]
        try:
            movement, variant = _apply_movement(
                variant=variant,
                movement_type=StockMovement.MOVEMENT_ADJUST,
                units=units,
                user=request.user,
                notes=data.get("notes", ""),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "item": ProductVariantSerializer(variant).data,
                "movement": StockMovementSerializer(movement).data,
            }
        )


class RestockVariantView(APIView):
    permission_classes = [IsAuthenticated, CatalogWritePermission]

    def post(self, request, pk):
        variant = ProductVariant.objects.filter(pk=pk).first()
        if not variant:
            return Response({"detail": "Item não encontrado."}, status=status.HTTP_404_NOT_FOUND)

        payload = dict(request.data)
        payload["variant_id"] = pk
        serializer = PackageMovementActionSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        package, units, package_quantity = _resolve_units(data, variant)
        if units < 1:
            return Response(
                {"detail": "Não foi possível calcular unidades para esta reposição."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        movement, variant = _apply_movement(
            variant=variant,
            movement_type=StockMovement.MOVEMENT_RECEIVE,
            units=units,
            user=request.user,
            notes=data.get("notes", "Reposicao rapida"),
            package=package,
            package_quantity=package_quantity,
        )

        return Response(
            {
                "item": ProductVariantSerializer(variant).data,
                "movement": StockMovementSerializer(movement).data,
            }
        )


class CatalogPresetsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        product_rules = get_local_product_rules()

        departments = list(
            Department.objects.filter(name__in=ALLOWED_DEPARTMENTS)
            .order_by(Lower("name"))
            .values_list("name", flat=True)
        )
        for dep_name in sorted(ALLOWED_DEPARTMENTS):
            if dep_name not in departments:
                departments.append(dep_name)
        departments.sort(key=lambda name: DEPARTMENT_ORDER.index(name) if name in DEPARTMENT_ORDER else 999)
        categories = list(
            Category.objects.filter(name__in=ALLOWED_CATEGORIES)
            .order_by(Lower("name"))
            .values_list("name", flat=True)
        )
        for category_name in CATEGORY_ORDER:
            if category_name not in categories:
                categories.append(category_name)
        categories.sort(
            key=lambda name: CATEGORY_ORDER.index(name) if name in CATEGORY_ORDER else 999
        )
        brands = list(
            ProductBase.objects.order_by(Lower("brand"))
            .values_list("brand", flat=True)
            .distinct()
        )
        products = list(
            ProductBase.objects.order_by(Lower("name"))
            .values_list("name", flat=True)
            .distinct()
        )
        variant_labels = list(
            ProductVariant.objects.exclude(variant_label="")
            .order_by(Lower("variant_label"))
            .values_list("variant_label", flat=True)
            .distinct()
        )
        package_sizes = list(
            ProductVariant.objects.order_by(Lower("package_size"))
            .values_list("package_size", flat=True)
            .distinct()
        )
        package_names = list(
            ProductPackage.objects.order_by(Lower("name"))
            .values_list("name", flat=True)
            .distinct()
        )

        # Include local rule vocabulary so first runs already have practical suggestions.
        for rule in product_rules:
            canonical = (rule.get("products") or [""])[0]
            if canonical:
                label = canonical.strip().title()
                if label and label not in products:
                    products.append(label)
            for value in rule.get("types", []):
                if value not in variant_labels:
                    variant_labels.append(value)
            for value in rule.get("sizes", []):
                if value not in package_sizes:
                    package_sizes.append(value)

        defaults = ["UNIDADE", "PACOTE", "FARDO", "CAIXA"]
        for name in defaults:
            if name not in package_names:
                package_names.append(name)

        quick_package_sizes = ["500G", "1KG", "2KG", "5KG", "10KG"]
        for size in quick_package_sizes:
            if size not in package_sizes:
                package_sizes.append(size)

        return Response(
            {
                "categories": categories,
                "departments": departments,
                "products": products,
                "brands": brands,
                "variant_labels": variant_labels,
                "package_sizes": package_sizes,
                "package_names": package_names,
                "product_rules": product_rules,
            }
        )


class CatalogLookupView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        barcode = (request.query_params.get("barcode") or "").strip()
        query = (request.query_params.get("q") or "").strip()
        department = (request.query_params.get("department") or "").strip()
        bluesoft_ready = bluesoft_is_configured()

        if barcode:
            local_item = lookup_local_by_barcode(barcode)
            external_item = None
            if bluesoft_ready:
                try:
                    external_item = lookup_by_barcode(barcode)
                except Exception:
                    external_item = None
            item = external_item.__dict__ if external_item else local_item
            return Response(
                {
                    "item": item,
                    "items": [],
                    "meta": {
                        "bluesoft_configurada": bluesoft_ready,
                        "fonte_item": item.get("source") if item else None,
                    },
                }
            )

        if len(query) >= 2:
            query_text = _normalize_for_search(query)
            query_tokens = _expand_query_tokens(_query_tokens(query))
            stock_items = _search_stock_catalog(
                query,
                department=department,
                limit=CATALOG_STOCK_SEARCH_LIMIT,
            )
            stock_count = len(stock_items)
            local_items = search_local_catalog(
                query,
                department=department,
                limit=CATALOG_LOCAL_SEARCH_LIMIT,
            )
            local_count = len(local_items)
            try:
                external_items = search_by_name(query)
            except Exception:
                external_items = []
            external_count = len(external_items)

            merged_items = []
            seen_keys = set()
            external_serialized = [entry.__dict__ for entry in external_items]
            # Prefer stock items first so assistant reflects everything already registered.
            ordered_sources = (
                stock_items + external_serialized + local_items
                if bluesoft_ready
                else stock_items + local_items + external_serialized
            )
            for item in ordered_sources:
                key = (
                    normalize_catalog_text(item.get("product_name") or ""),
                    normalize_catalog_text(item.get("brand") or ""),
                    normalize_catalog_text(item.get("variant_label") or ""),
                    normalize_catalog_text(item.get("package_size") or ""),
                )
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                score = _score_catalog_entry(query_text, query_tokens, item)
                if item.get("source") == "estoque_local":
                    score += 20
                elif item.get("source") == "catalogo_local_br":
                    score += 10
                item["_score"] = score
                merged_items.append(item)
            merged_items.sort(
                key=lambda item: (
                    item.get("_score", 0),
                    normalize_catalog_text(item.get("product_name") or ""),
                    normalize_catalog_text(item.get("brand") or ""),
                    normalize_catalog_text(item.get("variant_label") or ""),
                    _size_sort_tuple(item.get("package_size") or ""),
                ),
                reverse=True,
            )
            for item in merged_items:
                item.pop("_score", None)
                item.pop("_stock", None)
            return Response(
                {
                    "item": None,
                    "items": merged_items,
                    "meta": {
                        "modo": "premium",
                        "tokens_expandidos": query_tokens[:12],
                        "bluesoft_configurada": bluesoft_ready,
                        "resultados_estoque": stock_count,
                        "resultados_bluesoft": external_count,
                        "resultados_locais": local_count,
                    },
                }
            )

        return Response(
            {"detail": "Informe barcode ou q com pelo menos 2 caracteres."},
            status=status.HTTP_400_BAD_REQUEST,
        )


class CurrentSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response(
            {
                "id": user.id,
                "username": user.username,
                "is_staff": user.is_staff,
                "groups": list(
                    Group.objects.filter(user=user).values_list("name", flat=True)
                ),
            }
        )





