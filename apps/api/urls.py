from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.api import views

app_name = "api"

urlpatterns = [
    path("auth/token", TokenObtainPairView.as_view(), name="token"),
    path("auth/refresh", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/eu", views.EuView.as_view(), name="eu"),
    path("kpis", views.KpisView.as_view(), name="kpis"),
    path("margem/serie", views.SerieView.as_view(), name="serie"),
    path("margem/vendedor", views.VendedorView.as_view(), name="vendedor"),
    path("margem/sku", views.SkuView.as_view(), name="sku"),
    path("filtros", views.FiltrosView.as_view(), name="filtros"),
    path("carga", views.CargaView.as_view(), name="carga"),
]
