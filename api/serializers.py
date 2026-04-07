from rest_framework import serializers

from .models import (
    Category,
    Department,
    ProductBase,
    ProductPackage,
    ProductVariant,
    StockMovement,
    Expense,
)

ALLOWED_DEPARTMENTS = {
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
}


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ["id", "name", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class ProductBaseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    departments = DepartmentSerializer(many=True, read_only=True)
    department_ids = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(),
        many=True,
        write_only=True,
        required=False,
        source="departments",
    )

    class Meta:
        model = ProductBase
        fields = [
            "id",
            "category",
            "category_name",
            "name",
            "brand",
            "departments",
            "department_ids",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "category_name"]


class ProductPackageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductPackage
        fields = [
            "id",
            "variant",
            "name",
            "units_per_package",
            "is_active",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ProductVariantSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    brand = serializers.CharField(source="product.brand", read_only=True)
    category_id = serializers.IntegerField(source="product.category.id", read_only=True)
    category_name = serializers.CharField(source="product.category.name", read_only=True)
    departments = serializers.SerializerMethodField()
    packages = ProductPackageSerializer(many=True, read_only=True)

    def get_departments(self, obj):
        return [department.name for department in obj.product.departments.all()]

    class Meta:
        model = ProductVariant
        fields = [
            "id",
            "product",
            "product_name",
            "brand",
            "category_id",
            "category_name",
            "departments",
            "variant_label",
            "package_size",
            "price",
            "stock",
            "is_active",
            "created_at",
            "updated_at",
            "packages",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "product_name",
            "brand",
            "category_id",
            "category_name",
            "departments",
            "packages",
        ]

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("O preço deve ser maior que zero.")
        return value


class StockMovementSerializer(serializers.ModelSerializer):
    package_name = serializers.CharField(source="package.name", read_only=True)
    item_name = serializers.CharField(source="variant.product.name", read_only=True)
    variant_label = serializers.CharField(source="variant.variant_label", read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "variant",
            "item_name",
            "variant_label",
            "movement_type",
            "package",
            "package_name",
            "package_quantity",
            "units_delta",
            "notes",
            "created_by",
            "created_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "units_delta"]


class QuickEntrySerializer(serializers.Serializer):
    category_name = serializers.CharField(max_length=80, allow_blank=True, required=False)
    product_name = serializers.CharField(max_length=120)
    brand = serializers.CharField(max_length=120)
    variant_label = serializers.CharField(max_length=80, allow_blank=True, required=False)
    package_size = serializers.CharField(max_length=30)
    package_name = serializers.CharField(max_length=40, default="UNIDADE")
    package_units = serializers.IntegerField(min_value=1, required=False)
    department_names = serializers.ListField(
        child=serializers.CharField(max_length=80),
        allow_empty=True,
        required=False,
    )
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    quantity = serializers.IntegerField(min_value=1)

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("O preço deve ser maior que zero.")
        return value

    def validate_department_names(self, values):
        invalid = [name for name in values if name.strip().title() not in ALLOWED_DEPARTMENTS]
        if invalid:
            raise serializers.ValidationError(
                "Setor invalido informado. Use apenas setores padrao da mercearia."
            )
        return values


class PackageMovementActionSerializer(serializers.Serializer):
    variant_id = serializers.IntegerField(required=False)
    package_id = serializers.IntegerField(required=False)
    package_name = serializers.CharField(max_length=40, required=False)
    package_quantity = serializers.IntegerField(min_value=1, default=1)
    quantity_units = serializers.IntegerField(min_value=1, required=False)
    notes = serializers.CharField(max_length=255, allow_blank=True, required=False)

    def validate(self, attrs):
        if not attrs.get("variant_id"):
            raise serializers.ValidationError("variant_id e obrigatorio.")

        has_package = bool(attrs.get("package_id") or attrs.get("package_name"))
        has_units = "quantity_units" in attrs

        if not has_package and not has_units:
            raise serializers.ValidationError(
                "Informe package_id/package_name ou quantity_units."
            )
        return attrs


class AdjustStockSerializer(serializers.Serializer):
    variant_id = serializers.IntegerField()
    quantity_units = serializers.IntegerField()
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True)


class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = '__all__'