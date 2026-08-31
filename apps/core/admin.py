"""Django Admin — onde o negocio ajusta as regras sem passar por deploy."""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.core.exceptions import PermissionDenied

from .models import (
    ExecucaoCarga,
    MapaArmazem,
    MapaCanal,
    MapaGrupo,
    MapaTES,
    ParamOutlier,
    ReclassificacaoSKU,
    Usuario,
    Vendedor,
)


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    """Usuarios.

    Contas marcadas como `protegido` sao visiveis mas imutaveis pela interface —
    inclusive para superusuarios. E a conta administrativa de emergencia: se
    alguem errar as permissoes ou se trancar para fora, ela continua entrando.
    Alterar exige acesso direto ao banco, que e uma barreira deliberada.
    """

    list_display = ("username", "first_name", "last_name", "email", "is_staff", "protegido")
    list_filter = UserAdmin.list_filter + ("protegido",)
    readonly_fields = ("protegido",)

    fieldsets = UserAdmin.fieldsets + (
        ("BI", {"fields": ("protegido",)}),
    )

    def has_change_permission(self, request, obj=None) -> bool:
        if obj is not None and obj.protegido:
            return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None) -> bool:
        if obj is not None and obj.protegido:
            return False
        return super().has_delete_permission(request, obj)

    def delete_queryset(self, request, queryset):
        """A acao em massa nao checa objeto a objeto — precisa de barreira propria."""
        protegidos = queryset.filter(protegido=True)
        if protegidos.exists():
            nomes = ", ".join(protegidos.values_list("username", flat=True))
            raise PermissionDenied(
                f"Usuarios protegidos nao podem ser removidos: {nomes}."
            )
        super().delete_queryset(request, queryset)


@admin.register(ParamOutlier)
class ParamOutlierAdmin(admin.ModelAdmin):
    list_display = ("limite", "atualizado_em")

    def has_add_permission(self, request) -> bool:
        # Singleton: o registro e criado por data migration.
        return not ParamOutlier.objects.exists()

    def has_delete_permission(self, request, obj=None) -> bool:
        return False


@admin.register(MapaGrupo)
class MapaGrupoAdmin(admin.ModelAdmin):
    list_display = ("codigo", "rotulo", "agrupa_em", "ativo")
    list_editable = ("rotulo", "ativo")
    list_filter = ("ativo", "agrupa_em")
    search_fields = ("codigo", "rotulo")
    autocomplete_fields = ("agrupa_em",)


@admin.register(MapaArmazem)
class MapaArmazemAdmin(admin.ModelAdmin):
    """Nomes dos armazens.

    Editar aqui nao muda tela nenhuma ate rodar `refresh_views` — o rotulo vive
    nas materialized views.
    """

    list_display = ("codigo", "rotulo", "ativo")
    list_editable = ("rotulo", "ativo")
    list_filter = ("ativo",)
    search_fields = ("codigo", "rotulo")


@admin.register(ReclassificacaoSKU)
class ReclassificacaoSKUAdmin(admin.ModelAdmin):
    list_display = ("sku", "grupo", "observacao", "classificado_por", "classificado_em")
    list_filter = ("grupo",)
    search_fields = ("sku", "observacao")
    autocomplete_fields = ("grupo",)

    def save_model(self, request, obj, form, change):
        if not obj.classificado_por:
            obj.classificado_por = request.user
        super().save_model(request, obj, form, change)


@admin.register(MapaCanal)
class MapaCanalAdmin(admin.ModelAdmin):
    list_display = ("codigo_vendedor", "canal", "observacao")
    list_filter = ("canal",)
    search_fields = ("codigo_vendedor",)


@admin.register(MapaTES)
class MapaTESAdmin(admin.ModelAdmin):
    """Classificacao dos tipos de saida.

    Desmarcar `gera_receita` tira a linha do KPI de margem — mas so depois de
    `python manage.py refresh_views`, porque o corte vive na materialized view.
    """

    list_display = ("codigo", "descricao", "gera_receita")
    list_editable = ("descricao", "gera_receita")
    list_filter = ("gera_receita",)
    search_fields = ("codigo", "descricao")


@admin.register(Vendedor)
class VendedorAdmin(admin.ModelAdmin):
    list_display = ("codigo", "nome", "usuario", "ativo")
    list_filter = ("ativo",)
    search_fields = ("codigo", "nome")
    autocomplete_fields = ("usuario",)


@admin.register(ExecucaoCarga)
class ExecucaoCargaAdmin(admin.ModelAdmin):
    list_display = (
        "arquivo",
        "competencia",
        "dt_carga",
        "linhas_lidas",
        "linhas_gravadas",
        "status",
        "criado_em",
    )
    list_filter = ("arquivo", "status", "dt_carga")
    readonly_fields = tuple(f.name for f in ExecucaoCarga._meta.fields)

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False
