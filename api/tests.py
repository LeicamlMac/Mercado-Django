from django.contrib.auth.models import Group, User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch

from .models import Category, Department, ProductBase, ProductPackage, ProductVariant

PASSWORD = "StrongPass123!"
MANAGER_USERNAME = "manager"
VIEWER_USERNAME = "viewer"


class CatalogApiTests(APITestCase):
    def setUp(self):
        self.catalog_group, _ = Group.objects.get_or_create(name="catalog_manager")
        self.manager = self._get_or_create_user(MANAGER_USERNAME, add_catalog_group=True)
        self.viewer = self._get_or_create_user(VIEWER_USERNAME)

        category, _ = Category.objects.get_or_create(name="Arroz")
        department, _ = Department.objects.get_or_create(name="Mercearia")
        base, _ = ProductBase.objects.get_or_create(
            category=category, name="Arroz", brand="Camil"
        )
        base.departments.add(department)
        variant, _ = ProductVariant.objects.get_or_create(
            product=base,
            variant_label="Branco",
            package_size="1KG",
            defaults={"price": "8.90", "stock": 0},
        )
        variant.price = "8.90"
        variant.stock = 0
        variant.save(update_fields=["price", "stock"])
        self.unit_package, _ = ProductPackage.objects.get_or_create(
            variant=variant,
            name="UNIDADE",
            defaults={"units_per_package": 1, "is_default": True},
        )
        if self.unit_package.units_per_package != 1 or not self.unit_package.is_default:
            self.unit_package.units_per_package = 1
            self.unit_package.is_default = True
            self.unit_package.save(update_fields=["units_per_package", "is_default"])
        self.bundle_package, _ = ProductPackage.objects.get_or_create(
            variant=variant, name="FARDO", defaults={"units_per_package": 30}
        )
        if self.bundle_package.units_per_package != 30:
            self.bundle_package.units_per_package = 30
            self.bundle_package.save(update_fields=["units_per_package"])
        self.category = category
        self.department = department
        self.base = base
        self.variant = variant

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def _post_json(self, route_name, payload):
        return self.client.post(reverse(route_name), payload, format="json")

    def _get_or_create_user(self, username, add_catalog_group=False):
        user, _ = User.objects.get_or_create(username=username)
        user.set_password(PASSWORD)
        user.save(update_fields=["password"])
        if add_catalog_group:
            user.groups.add(self.catalog_group)
        return user

    def test_unauthenticated_user_cannot_access_items(self):
        response = self.client.get(reverse("items-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_viewer_cannot_receive_stock(self):
        self.authenticate(self.viewer)
        response = self._post_json(
            "receive-stock",
            {
                "variant_id": self.variant.id,
                "package_id": self.bundle_package.id,
                "package_quantity": 1,
            },
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_receive_by_bundle_and_sell_units(self):
        self.authenticate(self.manager)

        receive_response = self._post_json(
            "receive-stock",
            {
                "variant_id": self.variant.id,
                "package_id": self.bundle_package.id,
                "package_quantity": 2,
            },
        )
        self.assertEqual(receive_response.status_code, status.HTTP_200_OK)
        self.assertEqual(receive_response.data["item"]["stock"], 60)

        sell_response = self._post_json(
            "sell-stock",
            {"variant_id": self.variant.id, "quantity_units": 7},
        )
        self.assertEqual(sell_response.status_code, status.HTTP_200_OK)
        self.assertEqual(sell_response.data["item"]["stock"], 53)

    def test_cannot_sell_more_than_stock(self):
        self.authenticate(self.manager)
        response = self._post_json(
            "sell-stock",
            {"variant_id": self.variant.id, "quantity_units": 1},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_adjust_stock_endpoint(self):
        self.authenticate(self.manager)
        response = self._post_json(
            "adjust-stock",
            {
                "variant_id": self.variant.id,
                "quantity_units": 12,
                "notes": "Inventory count",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["item"]["stock"], 12)

    def test_token_and_me_endpoint(self):
        response = self._post_json(
            "token-obtain-pair", {"username": MANAGER_USERNAME, "password": PASSWORD}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        token = response.data["access"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        me_response = self.client.get(reverse("current-session"))
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)
        self.assertEqual(me_response.data["username"], "manager")
        self.assertIn("catalog_manager", me_response.data["groups"])

    def test_filter_items_by_department(self):
        self.authenticate(self.manager)
        response = self.client.get(reverse("items-list"), {"department_id": self.department.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_product_metrics_contract_has_flat_and_grouped_inventory(self):
        self.authenticate(self.manager)
        response = self.client.get(reverse("product-metrics"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertIn("total_variants", response.data)
        self.assertIn("active_variants", response.data)
        self.assertIn("total_stock", response.data)
        self.assertIn("low_stock_count", response.data)
        self.assertIn("inventory", response.data)

        inventory = response.data["inventory"]
        self.assertEqual(response.data["total_variants"], inventory["total_variants"])
        self.assertEqual(response.data["active_variants"], inventory["active_variants"])
        self.assertEqual(response.data["total_stock"], inventory["total_stock"])
        self.assertEqual(response.data["low_stock_count"], inventory["low_stock_count"])

    def test_product_metrics_updates_after_receive_stock(self):
        self.authenticate(self.manager)
        receive_response = self._post_json(
            "receive-stock",
            {
                "variant_id": self.variant.id,
                "package_id": self.bundle_package.id,
                "package_quantity": 1,
            },
        )
        self.assertEqual(receive_response.status_code, status.HTTP_200_OK)

        metrics_response = self.client.get(reverse("product-metrics"))
        self.assertEqual(metrics_response.status_code, status.HTTP_200_OK)
        self.assertEqual(metrics_response.data["total_stock"], 30)

    def test_items_list_ordering_az_ignores_accents_and_cedilha(self):
        self.authenticate(self.manager)
        category = self.category
        department = self.department
        entries = [
            ("Ameixa", "Marca A"),
            ("Açafrão", "Marca B"),
            ("Açaí", "Marca C"),
            ("Banana", "Marca D"),
        ]
        for name, brand in entries:
            base = ProductBase.objects.create(category=category, name=name, brand=brand)
            base.departments.add(department)
            ProductVariant.objects.create(
                product=base,
                variant_label="Tradicional",
                package_size="1KG",
                price="5.00",
                stock=3,
            )

        response = self.client.get(
            reverse("items-list"),
            {"ordering": "product__name,product__brand,variant_label,package_size"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [item["product_name"] for item in response.data["results"]]
        self.assertEqual(names, ["Açafrão", "Açaí", "Ameixa", "Arroz", "Banana"])

    def test_quick_entry_reuses_existing_variant_without_category(self):
        self.authenticate(self.manager)
        response = self._post_json(
            "quick-entry",
            {
                "product_name": "arroz",
                "brand": "camil",
                "variant_label": "branco",
                "package_size": "1kg",
                "package_name": "UNIDADE",
                "package_units": 1,
                "department_names": ["Mercearia"],
                "price": "9.99",
                "quantity": 2,
            },
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 2)
        self.assertEqual(ProductVariant.objects.count(), 1)

    def test_quick_entry_keeps_existing_package_units(self):
        self.authenticate(self.manager)
        response = self._post_json(
            "quick-entry",
            {
                "category_name": "Mercearia",
                "product_name": "Arroz",
                "brand": "Camil",
                "variant_label": "Branco",
                "package_size": "1KG",
                "package_name": "FARDO",
                "package_units": 1,
                "department_names": ["Mercearia"],
                "price": "9.99",
                "quantity": 1,
            },
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.variant.refresh_from_db()
        self.bundle_package.refresh_from_db()
        self.assertEqual(self.bundle_package.units_per_package, 30)
        self.assertEqual(self.variant.stock, 30)

    def test_catalog_lookup_filters_invalid_refrigerante_brand_variant(self):
        bebidas, _ = Category.objects.get_or_create(name="Bebidas")
        bebidas_dep, _ = Department.objects.get_or_create(name="Bebidas")

        base = ProductBase.objects.create(
            category=bebidas,
            name="Refrigerante",
            brand="Coca-Cola",
        )
        base.departments.add(bebidas_dep)

        ProductVariant.objects.create(
            product=base,
            variant_label="Guarana",
            package_size="2L",
            price="9.90",
            stock=10,
        )
        ProductVariant.objects.create(
            product=base,
            variant_label="Cola",
            package_size="2L",
            price="9.90",
            stock=10,
        )

        self.authenticate(self.manager)
        response = self.client.get(reverse("catalog-lookup"), {"q": "refrigerante coca cola"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        labels = {
            (item["brand"], item["variant_label"])
            for item in response.data.get("items", [])
            if item.get("product_name") == "Refrigerante" and item.get("brand") == "Coca-Cola"
        }
        self.assertIn(("Coca-Cola", "Cola"), labels)
        self.assertNotIn(("Coca-Cola", "Guarana"), labels)

    def test_catalog_lookup_premium_handles_small_typos(self):
        utilidades, _ = Category.objects.get_or_create(name="Utilidades")
        util_dep, _ = Department.objects.get_or_create(name="Utilidades")
        base = ProductBase.objects.create(
            category=utilidades,
            name="Isqueiro",
            brand="Bic",
        )
        base.departments.add(util_dep)
        ProductVariant.objects.create(
            product=base,
            variant_label="Descartavel",
            package_size="1UN",
            price="7.90",
            stock=30,
        )

        self.authenticate(self.manager)
        response = self.client.get(reverse("catalog-lookup"), {"q": "isqueiroo"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        products = [item.get("product_name") for item in response.data.get("items", [])]
        self.assertIn("Isqueiro", products)

    @patch("api.views.search_by_name")
    @patch("api.views.search_local_catalog")
    @patch("api.views._search_stock_catalog")
    def test_catalog_lookup_limits_response_size(self, mock_stock, mock_local, mock_external):
        self.authenticate(self.manager)
        mock_stock.return_value = []
        mock_external.return_value = []
        mock_local.return_value = [
            {
                "barcode": str(index),
                "product_name": f"Produto {index}",
                "brand": "Marca",
                "category": "Mercearia",
                "variant_label": "Tradicional",
                "package_size": "1UN",
                "department_names": ["Mercearia"],
                "source": "catalogo_local_br",
            }
            for index in range(150)
        ]

        response = self.client.get(reverse("catalog-lookup"), {"q": "produto"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["items"]), 120)
        self.assertEqual(response.data["meta"]["limite_itens"], 120)
        self.assertEqual(response.data["meta"]["resultados_totais"], 150)

    @patch("api.views.search_by_name")
    @patch("api.views.search_local_catalog")
    @patch("api.views._search_stock_catalog")
    def test_catalog_lookup_hides_expanded_tokens_from_response(self, mock_stock, mock_local, mock_external):
        self.authenticate(self.manager)
        mock_stock.return_value = []
        mock_external.return_value = []
        mock_local.return_value = [
            {
                "barcode": "1",
                "product_name": "Refrigerante",
                "brand": "Coca-Cola",
                "category": "Bebidas",
                "variant_label": "Zero",
                "package_size": "2L",
                "department_names": ["Bebidas"],
                "source": "catalogo_local_br",
            }
        ]

        response = self.client.get(reverse("catalog-lookup"), {"q": "refri zero"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("tokens_expandidos", response.data["meta"])
