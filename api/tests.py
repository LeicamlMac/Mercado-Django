from django.contrib.auth.models import Group, User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Category, Department, ProductBase, ProductPackage, ProductVariant


class CatalogApiTests(APITestCase):
    def setUp(self):
        self.catalog_group, _ = Group.objects.get_or_create(name="catalog_manager")

        self.manager = User.objects.create_user(
            username="manager", password="StrongPass123!"
        )
        self.manager.groups.add(self.catalog_group)

        self.viewer = User.objects.create_user(
            username="viewer", password="StrongPass123!"
        )

        self.category = Category.objects.create(name="Arroz")
        self.department = Department.objects.create(name="Mercearia")
        self.base = ProductBase.objects.create(
            category=self.category, name="Arroz", brand="Camil"
        )
        self.base.departments.add(self.department)
        self.variant = ProductVariant.objects.create(
            product=self.base,
            variant_label="Branco",
            package_size="1KG",
            price="8.90",
            stock=0,
        )
        self.unit_package = ProductPackage.objects.create(
            variant=self.variant, name="UNIDADE", units_per_package=1, is_default=True
        )
        self.bundle_package = ProductPackage.objects.create(
            variant=self.variant, name="FARDO", units_per_package=30
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_unauthenticated_user_cannot_access_items(self):
        response = self.client.get(reverse("items-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_viewer_cannot_receive_stock(self):
        self.authenticate(self.viewer)
        response = self.client.post(
            reverse("receive-stock"),
            {"variant_id": self.variant.id, "package_id": self.bundle_package.id, "package_quantity": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_receive_by_bundle_and_sell_units(self):
        self.authenticate(self.manager)

        receive_response = self.client.post(
            reverse("receive-stock"),
            {
                "variant_id": self.variant.id,
                "package_id": self.bundle_package.id,
                "package_quantity": 2,
            },
            format="json",
        )
        self.assertEqual(receive_response.status_code, status.HTTP_200_OK)
        self.assertEqual(receive_response.data["item"]["stock"], 60)

        sell_response = self.client.post(
            reverse("sell-stock"),
            {"variant_id": self.variant.id, "quantity_units": 7},
            format="json",
        )
        self.assertEqual(sell_response.status_code, status.HTTP_200_OK)
        self.assertEqual(sell_response.data["item"]["stock"], 53)

    def test_cannot_sell_more_than_stock(self):
        self.authenticate(self.manager)
        response = self.client.post(
            reverse("sell-stock"),
            {"variant_id": self.variant.id, "quantity_units": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_adjust_stock_endpoint(self):
        self.authenticate(self.manager)
        response = self.client.post(
            reverse("adjust-stock"),
            {"variant_id": self.variant.id, "quantity_units": 12, "notes": "Inventory count"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["item"]["stock"], 12)

    def test_token_and_me_endpoint(self):
        response = self.client.post(
            reverse("token-obtain-pair"),
            {"username": "manager", "password": "StrongPass123!"},
            format="json",
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

    def test_quick_entry_reuses_existing_variant_without_category(self):
        self.authenticate(self.manager)
        response = self.client.post(
            reverse("quick-entry"),
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
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 2)
        self.assertEqual(ProductVariant.objects.count(), 1)

    def test_quick_entry_keeps_existing_package_units(self):
        self.authenticate(self.manager)
        response = self.client.post(
            reverse("quick-entry"),
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
            format="json",
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
