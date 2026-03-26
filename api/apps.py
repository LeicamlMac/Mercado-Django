from django.apps import AppConfig


class ApiConfig(AppConfig):
    name = 'api'
    verbose_name = "Catalogo da Mercearia"

    def ready(self):
        # Register signal handlers for DB tuning and bootstrap data.
        from . import signals  # noqa: F401
