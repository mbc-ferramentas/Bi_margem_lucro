"""Nomeia os grupos de consumo interno e corrige o 0129.

O cadastro so conhecia quatro codigos (0004): tudo o mais caia em 'Sem grupo' —
2.232 linhas e R$ 1.088.765,98 de receita num balde que o negocio ja sabe
nomear (despesa, ativo imobilizado, EPI, material de consumo). Sem rotulo nao
existe recorte: a lista de opcoes da tela vem do fato, mas o nome vem daqui.

O 0129 estava rotulado errado. Nao e 'acessorio de e-commerce', e **fabricacao
propria** — e por isso a 0011 o somava dentro do Ecommerce sem que fosse esse o
caso. Aqui ele recupera identidade propria: sai de dentro de 0128 e passa a ser
um grupo como qualquer outro. O 0150 -> 0057 (Diversos em Agricola) continua
valendo; aquela consolidacao esta correta.

Todos continuam **dentro** do KPI de margem: o recorte e trabalho do filtro de
grupo na tela (multi-selecao), nao de exclusao no SQL.

Nenhuma view muda: o SQL da 0012 ja resolve rotulo e consolidacao por
LEFT JOIN em core_mapagrupo, em tempo de refresh. Por isso a migration termina
atualizando as materialized views — sem esse passo o deploy sobe com os rotulos
antigos na tela ate alguem lembrar de rodar `refresh_views` na mao.
"""

from django.db import migrations

# Codigo -> rotulo. Nenhum tem `agrupa_em`: cada um e um marcador proprio.
GRUPOS = [
    ("0077", "Material de consumo"),
    ("0078", "EPI"),
    ("0129", "Fabricação própria"),
    ("0130", "Produtos para cozinha"),
    ("0131", "Lanches e refeições"),
    ("0132", "Ativo imobilizado"),
    ("0151", "Despesas"),
]

# Como o 0129 estava antes da 0013, para o reverso nao perder a consolidacao.
ESTADO_ANTERIOR_0129 = ("Ecommerce - acessorios", "0128")


def nomear(apps, schema_editor):
    MapaGrupo = apps.get_model("core", "MapaGrupo")
    for codigo, rotulo in GRUPOS:
        # update_or_create e nao create: base com o cadastro ja ajustado a mao
        # no Admin nao pode quebrar o migrate.
        MapaGrupo.objects.update_or_create(
            codigo=codigo, defaults={"rotulo": rotulo, "agrupa_em_id": None}
        )
    atualizar_views()


def reverter(apps, schema_editor):
    MapaGrupo = apps.get_model("core", "MapaGrupo")
    rotulo, destino = ESTADO_ANTERIOR_0129
    MapaGrupo.objects.filter(codigo="0129").update(rotulo=rotulo, agrupa_em_id=destino)
    MapaGrupo.objects.filter(
        codigo__in=[c for c, _ in GRUPOS if c != "0129"]
    ).delete()
    atualizar_views()


def atualizar_views():
    # Import tardio: migration nao deve carregar codigo de app na importacao do
    # modulo, so quando a operacao realmente roda.
    from apps.etl import writers

    # `concorrente=None` deixa o writers decidir pelo contexto — dentro do
    # migrate estamos em transacao, e REFRESH CONCURRENTLY nao roda ali.
    writers.refresh_views()


class Migration(migrations.Migration):
    dependencies = [("core", "0012_armazem")]

    operations = [migrations.RunPython(nomear, reverter)]
