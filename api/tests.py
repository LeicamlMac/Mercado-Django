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
