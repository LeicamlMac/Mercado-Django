from django.contrib.auth.models import Group, User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

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
