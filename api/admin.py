from django.contrib import admin

from .models import (
    Category,
    Department,
    ProductBase,
    ProductPackage,
    ProductVariant,
    StockMovement,
)

admin.site.site_header = "Painel da Mercearia"
admin.site.site_title = "Administracao da Mercearia"
admin.site.index_title = "Gestao de cadastro e estoque"


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "updated_at")
    search_fields = ("name",)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "updated_at")
    search_fields = ("name",)


@admin.register(ProductBase)
class ProductBaseAdmin(admin.ModelAdmin):
    list_display = ("name", "brand", "category", "departments_display", "is_active", "updated_at")
    search_fields = ("name", "brand", "category__name")
    list_filter = ("category", "departments", "is_active")
    filter_horizontal = ("departments",)

    def departments_display(self, obj):
        return ", ".join(obj.departments.values_list("name", flat=True))

    departments_display.short_description = "setores"


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "variant_label",
        "package_size",
        "price",
        "stock",
        "is_active",
        "updated_at",
    )
    search_fields = ("product__name", "product__brand", "variant_label", "package_size")
    list_filter = ("product__category", "is_active")


@admin.register(ProductPackage)
class ProductPackageAdmin(admin.ModelAdmin):
    list_display = ("variant", "name", "units_per_package", "is_default", "is_active")
    search_fields = ("name", "variant__product__name", "variant__product__brand")
    list_filter = ("is_default", "is_active")


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = (
        "variant",
        "movement_type",
        "package",
        "package_quantity",
        "units_delta",
        "created_by",
        "created_at",
    )
    search_fields = ("variant__product__name", "variant__product__brand", "notes")
    list_filter = ("movement_type", "created_at")
