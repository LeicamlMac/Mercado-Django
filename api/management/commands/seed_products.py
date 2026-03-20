from decimal import Decimal

from django.core.management.base import BaseCommand

from api.models import (
    Category,
    Department,
    ProductBase,
    ProductPackage,
    ProductVariant,
    StockMovement,
)
from api.services.taxonomy import resolve_category_name


class Command(BaseCommand):
    help = "Seed sample food catalog for local development."

    def handle(self, *args, **options):
        catalog = [
            {
                "category": "Arroz",
                "product": "Arroz",
                "brand": "Tio Joao",
                "variant": "Branco",
                "size": "1KG",
                "price": Decimal("7.99"),
                "stock_units": 42,
                "packages": [("UNIDADE", 1), ("FARDO", 30)],
                "departments": ["Mercearia"],
            },
            {
                "category": "Arroz",
                "product": "Arroz",
                "brand": "Camil",
                "variant": "Parboilizado",
                "size": "5KG",
                "price": Decimal("34.90"),
                "stock_units": 18,
                "packages": [("UNIDADE", 1), ("FARDO", 6)],
                "departments": ["Mercearia"],
            },
            {
                "category": "Feijao",
                "product": "Feijao",
                "brand": "Kicaldo",
                "variant": "Carioca",
                "size": "1KG",
                "price": Decimal("9.50"),
                "stock_units": 31,
                "packages": [("UNIDADE", 1), ("FARDO", 30)],
                "departments": ["Mercearia"],
            },
            {
                "category": "Feijao",
                "product": "Feijao",
                "brand": "Camil",
                "variant": "Preto",
                "size": "1KG",
                "price": Decimal("9.90"),
                "stock_units": 26,
                "packages": [("UNIDADE", 1), ("FARDO", 30)],
                "departments": ["Mercearia"],
            },
            {
                "category": "Macarrao",
                "product": "Macarrao",
                "brand": "Renata",
                "variant": "Espaguete",
                "size": "500G",
                "price": Decimal("5.75"),
                "stock_units": 22,
                "packages": [("UNIDADE", 1), ("FARDO", 20)],
                "departments": ["Mercearia"],
            },
            {
                "category": "Leite",
                "product": "Leite",
                "brand": "Italac",
                "variant": "Integral",
                "size": "1L",
                "price": Decimal("5.89"),
                "stock_units": 36,
                "packages": [("UNIDADE", 1), ("CAIXA", 12)],
                "departments": ["Laticinios", "Bebidas"],
            },
            {
                "category": "Carne",
                "product": "Frango",
                "brand": "Sadia",
                "variant": "Peito",
                "size": "1KG",
                "price": Decimal("19.90"),
                "stock_units": 14,
                "packages": [("UNIDADE", 1), ("CAIXA", 10)],
                "departments": ["Carnes"],
            },
            {
                "category": "Suco",
                "product": "Suco",
                "brand": "Del Valle",
                "variant": "Uva",
                "size": "1L",
                "price": Decimal("7.49"),
                "stock_units": 20,
                "packages": [("UNIDADE", 1), ("FARDO", 6)],
                "departments": ["Bebidas"],
            },
            {
                "category": "Refrigerante",
                "product": "Refrigerante",
                "brand": "Coca-Cola",
                "variant": "Cola",
                "size": "2L",
                "price": Decimal("10.99"),
                "stock_units": 24,
                "packages": [("UNIDADE", 1), ("FARDO", 6)],
                "departments": ["Bebidas"],
            },
            {
                "category": "Refrigerante",
                "product": "Refrigerante",
                "brand": "Guarana Antarctica",
                "variant": "Guarana",
                "size": "2L",
                "price": Decimal("9.99"),
                "stock_units": 18,
                "packages": [("UNIDADE", 1), ("FARDO", 6)],
                "departments": ["Bebidas"],
            },
            {
                "category": "Iogurte",
                "product": "Iogurte",
                "brand": "Vigor",
                "variant": "Morango",
                "size": "170G",
                "price": Decimal("3.49"),
                "stock_units": 28,
                "packages": [("UNIDADE", 1), ("CAIXA", 24)],
                "departments": ["Laticinios"],
            },
            {
                "category": "Agua",
                "product": "Agua",
                "brand": "Crystal",
                "variant": "Sem Gas",
                "size": "1.5L",
                "price": Decimal("3.99"),
                "stock_units": 30,
                "packages": [("UNIDADE", 1), ("FARDO", 6)],
                "departments": ["Bebidas"],
            },
        ]

        created = 0
        for item in catalog:
            normalized_category = resolve_category_name(
                product_name=item["product"],
                department_names=item.get("departments", []),
                requested_category=item["category"],
            )
            category, _ = Category.objects.get_or_create(name=normalized_category)
            base, _ = ProductBase.objects.get_or_create(
                category=category,
                name=item["product"],
                brand=item["brand"],
            )
            departments = []
            for dep_name in item.get("departments", []):
                dep, _ = Department.objects.get_or_create(name=dep_name)
                departments.append(dep.id)
            if departments:
                base.departments.set(departments)
            variant, was_created = ProductVariant.objects.get_or_create(
                product=base,
                variant_label=item["variant"],
                package_size=item["size"],
                defaults={
                    "price": item["price"],
                    "stock": item["stock_units"],
                    "is_active": True,
                },
            )
            if not was_created:
                variant.price = item["price"]
                variant.save(update_fields=["price", "updated_at"])

            for idx, (name, units) in enumerate(item["packages"]):
                ProductPackage.objects.get_or_create(
                    variant=variant,
                    name=name,
                    defaults={
                        "units_per_package": units,
                        "is_default": idx == 0,
                        "is_active": True,
                    },
                )

            if not variant.movements.exists() and item["stock_units"] > 0:
                StockMovement.objects.create(
                    variant=variant,
                    movement_type=StockMovement.MOVEMENT_ADJUST,
                    units_delta=item["stock_units"],
                    package_quantity=1,
                    notes="Initial seed stock",
                )

            created += int(was_created)

        self.stdout.write(
            self.style.SUCCESS(f"Catalog seed finished. New variants created: {created}.")
        )
