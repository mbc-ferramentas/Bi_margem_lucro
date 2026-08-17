from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

urlpatterns = [
    # Consumido pelo healthcheck do container na VPS. Nao toca no banco de
    # proposito: responde enquanto o processo web estiver de pe.
    path("health", lambda _r: JsonResponse({"status": "ok"}), name="health"),
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.api.urls")),
]
