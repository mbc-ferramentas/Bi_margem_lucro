from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.api import usuarios, views

app_name = "api"

urlpatterns = [
    path("auth/token", TokenObtainPairView.as_view(), name="token"),
    path("auth/refresh", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/eu", views.EuView.as_view(), name="eu"),
    path("kpis", views.KpisView.as_view(), name="kpis"),
    path("margem/serie", views.SerieView.as_view(), name="serie"),
    path("margem/vendedor", views.VendedorView.as_view(), name="vendedor"),
    path("margem/sku", views.SkuView.as_view(), name="sku"),
    path("margem/sku/<str:sku>", views.SkuDetalheView.as_view(), name="sku-detalhe"),
    path("margem/armazem", views.ArmazemView.as_view(), name="armazem"),
    path("margem/pedidos", views.PedidosView.as_view(), name="pedidos"),
    path("margem/pedidos/<str:chave>", views.PedidoView.as_view(), name="pedido"),
    path("carteira", views.CarteiraView.as_view(), name="carteira"),
    path("carteira/filtros", views.CarteiraFiltrosView.as_view(), name="carteira-filtros"),
    path("filtros", views.FiltrosView.as_view(), name="filtros"),
    path("carga", views.CargaView.as_view(), name="carga"),
    path("usuarios", usuarios.UsuariosView.as_view(), name="usuarios"),
    path("usuarios/<int:pk>", usuarios.UsuarioView.as_view(), name="usuario"),
    path("usuarios/<int:pk>/senha", usuarios.SenhaView.as_view(), name="usuario-senha"),
]
