from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    AdjustStockView,
    CatalogLookupView,
    CatalogPresetsView,
    CategoryViewSet,
    CurrentSessionView,
    DepartmentViewSet,
    HealthCheckView,
    ProductPackageViewSet,
    ProductBaseViewSet,
    ProductVariantChoicesView,
    ProductMetricsView,
    ProductVariantViewSet,
    QuickEntryView,
    ReceiveStockView,
    RestockVariantView,
    SellStockView,
    StockMovementViewSet,
)

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="categories")
router.register("departments", DepartmentViewSet, basename="departments")
router.register("products", ProductBaseViewSet, basename="products")
router.register("items", ProductVariantViewSet, basename="items")
router.register("packages", ProductPackageViewSet, basename="packages")
router.register("movements", StockMovementViewSet, basename="movements")

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health-check"),
    path("auth/token/", TokenObtainPairView.as_view(), name="token-obtain-pair"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/me/", CurrentSessionView.as_view(), name="current-session"),
    path("catalog/presets/", CatalogPresetsView.as_view(), name="catalog-presets"),
    path("catalog/lookup/", CatalogLookupView.as_view(), name="catalog-lookup"),
    path("items/choices/", ProductVariantChoicesView.as_view(), name="item-choices"),
    path("items/metrics/", ProductMetricsView.as_view(), name="product-metrics"),
    path("items/quick-entry/", QuickEntryView.as_view(), name="quick-entry"),
    path("items/receive/", ReceiveStockView.as_view(), name="receive-stock"),
    path("items/sell/", SellStockView.as_view(), name="sell-stock"),
    path("items/adjust/", AdjustStockView.as_view(), name="adjust-stock"),
    path("items/<int:pk>/restock/", RestockVariantView.as_view(), name="restock-item"),
    path("", include(router.urls)),
]
