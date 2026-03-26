"""
URL configuration for config project.
"""

from pathlib import Path

from django.conf import settings
from django.contrib import admin
from django.http import Http404
from django.urls import include, path, re_path
from django.views.generic import TemplateView
from django.views.static import serve


def _disable_cache(response):
    """Evita cache agressivo do frontend durante desenvolvimento."""
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    return response


def frontend_static(request, path):
    """
    Serve arquivos do build do React no modo de desenvolvimento.
    """
    full_path = (settings.FRONTEND_DIST_DIR / path).resolve()
    root = Path(settings.FRONTEND_DIST_DIR).resolve()
    if not str(full_path).startswith(str(root)):
        raise Http404("Arquivo invalido.")
    if not full_path.exists() or not full_path.is_file():
        raise Http404("Arquivo nao encontrado.")
    response = serve(request, path, document_root=settings.FRONTEND_DIST_DIR)
    return _disable_cache(response)


def frontend_index(request):
    response = TemplateView.as_view(template_name="index.html")(request)
    return _disable_cache(response)


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    re_path(
        r"^(?P<path>assets/.*|.*\.(?:js|css|png|svg|ico|json|txt|map|webp))$",
        frontend_static,
    ),
    path("", frontend_index),
    re_path(r"^(?!api/|admin/).*$", frontend_index),
]
