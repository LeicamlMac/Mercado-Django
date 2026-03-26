from django.db.backends.signals import connection_created
from django.db.models.signals import post_migrate
from django.dispatch import receiver

from .models import Category, Department
from .services.taxonomy import ALLOWED_CATEGORIES
from .serializers import ALLOWED_DEPARTMENTS


@receiver(connection_created)
def tune_sqlite_connection(sender, connection, **kwargs):
    if connection.vendor != "sqlite":
        return
    with connection.cursor() as cursor:
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.execute("PRAGMA journal_mode = WAL;")
        cursor.execute("PRAGMA synchronous = NORMAL;")
        cursor.execute("PRAGMA busy_timeout = 5000;")
        cursor.execute("PRAGMA temp_store = MEMORY;")


@receiver(post_migrate)
def seed_default_catalog_data(sender, **kwargs):
    Category.objects.bulk_create(
        [Category(name=name) for name in ALLOWED_CATEGORIES],
        ignore_conflicts=True,
    )
    Department.objects.bulk_create(
        [Department(name=name) for name in ALLOWED_DEPARTMENTS],
        ignore_conflicts=True,
    )
