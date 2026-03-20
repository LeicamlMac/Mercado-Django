from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create default users and groups for local development."

    def handle(self, *args, **options):
        manager_group, _ = Group.objects.get_or_create(name="catalog_manager")

        manager, manager_created = User.objects.get_or_create(
            username="manager",
            defaults={"is_staff": True, "email": "manager@mercado.local"},
        )
        if manager_created:
            manager.set_password("Manager@123")
            manager.save()
        manager.groups.add(manager_group)

        viewer, viewer_created = User.objects.get_or_create(
            username="viewer",
            defaults={"email": "viewer@mercado.local"},
        )
        if viewer_created:
            viewer.set_password("Viewer@123")
            viewer.save()

        created_count = int(manager_created) + int(viewer_created)
        self.stdout.write(
            self.style.SUCCESS(
                "Bootstrap completed. "
                f"Users created: {created_count}. "
                "manager/Manager@123, viewer/Viewer@123"
            )
        )
