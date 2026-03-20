from django.core.management.base import BaseCommand

from api.models import Category, ProductBase
from api.services.taxonomy import CATEGORY_ORDER, resolve_category_name


class Command(BaseCommand):
    help = "Normalize existing catalog categories to professional supermarket taxonomy."

    def handle(self, *args, **options):
        for name in CATEGORY_ORDER:
            Category.objects.get_or_create(name=name)

        updated = 0
        for base in ProductBase.objects.select_related("category").prefetch_related("departments").all():
            department_names = list(base.departments.values_list("name", flat=True))
            expected = resolve_category_name(
                product_name=base.name,
                department_names=department_names,
                requested_category=base.category.name,
            )
            if base.category.name == expected:
                continue
            category = Category.objects.get(name=expected)
            base.category = category
            base.save(update_fields=["category", "updated_at"])
            updated += 1

        removed = 0
        for category in Category.objects.all():
            if category.name in CATEGORY_ORDER:
                continue
            if category.products.exists():
                continue
            category.delete()
            removed += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Taxonomia normalizada. Produtos atualizados: {updated}. Categorias removidas: {removed}."
            )
        )
