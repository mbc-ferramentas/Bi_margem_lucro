"""Sementes: grupos, canal do integrador, parametro de outlier e perfis de acesso."""

from django.db import migrations

# Grupos observados no export de 07/2026. Os rotulos vieram do negocio; os demais
# codigos podem ser cadastrados pelo Admin conforme aparecerem.
GRUPOS = [
    ("0128", "Ecommerce"),
    ("0057", "Agricola"),
    ("0129", "Ecommerce - acessorios"),
    ("0150", "Diversos"),
]

PERMISSOES_GERENTE = [
    # Gerente le o BI inteiro, mas nao altera regra de negocio.
    "view_execucaocarga",
]

PERMISSOES_ADMIN = [
    "add_mapagrupo", "change_mapagrupo", "delete_mapagrupo", "view_mapagrupo",
    "add_reclassificacaosku", "change_reclassificacaosku",
    "delete_reclassificacaosku", "view_reclassificacaosku",
    "add_mapacanal", "change_mapacanal", "delete_mapacanal", "view_mapacanal",
    "add_vendedor", "change_vendedor", "delete_vendedor", "view_vendedor",
    "change_paramoutlier", "view_paramoutlier",
    "view_execucaocarga",
]


def garantir_permissoes() -> None:
    """Cria as Permission dos models de core antes de atribui-las aos grupos.

    O Django so cria as permissoes no sinal `post_migrate`, que roda ao final de
    todo o `migrate`. Uma data migration que tenta atribuir permissao antes disso
    encontra a tabela vazia e cria grupos sem nenhuma — silenciosamente.
    """
    from django.apps import apps as apps_reais
    from django.contrib.auth.management import create_permissions

    config = apps_reais.get_app_config("core")
    create_permissions(config, verbosity=0)


def semear(apps, schema_editor):
    garantir_permissoes()

    MapaGrupo = apps.get_model("core", "MapaGrupo")
    MapaCanal = apps.get_model("core", "MapaCanal")
    ParamOutlier = apps.get_model("core", "ParamOutlier")
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")

    for codigo, rotulo in GRUPOS:
        MapaGrupo.objects.update_or_create(codigo=codigo, defaults={"rotulo": rotulo})

    # Regra 1: o codigo 72 e o integrador Lexos (Amazon, Magalu, Shopee, Mercado
    # Livre). Nao e uma pessoa — vira canal, nao vendedor.
    MapaCanal.objects.update_or_create(
        codigo_vendedor="72",
        defaults={
            "canal": "Marketplace",
            "observacao": "Integrador Lexos — Amazon, Magalu, Shopee, Mercado Livre",
        },
    )

    # Regra 2: corte de quarentena de outlier de custo.
    ParamOutlier.objects.update_or_create(id=1, defaults={"limite": "-1.0"})

    for nome, codenames in (
        ("admin", PERMISSOES_ADMIN),
        ("gerente", PERMISSOES_GERENTE),
        ("vendedor", []),
    ):
        grupo, _ = Group.objects.get_or_create(name=nome)
        if codenames:
            grupo.permissions.set(Permission.objects.filter(codename__in=codenames))


def remover(apps, schema_editor):
    apps.get_model("auth", "Group").objects.filter(
        name__in=["admin", "gerente", "vendedor"]
    ).delete()
    apps.get_model("core", "MapaCanal").objects.filter(codigo_vendedor="72").delete()
    apps.get_model("core", "MapaGrupo").objects.filter(
        codigo__in=[c for c, _ in GRUPOS]
    ).delete()


class Migration(migrations.Migration):
    dependencies = [("core", "0003_views_margem")]
    operations = [migrations.RunPython(semear, remover)]
