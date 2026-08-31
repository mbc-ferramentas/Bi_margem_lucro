"""Carteira de pedidos em aberto (SC6) contra os CSVs reais.

O risco especifico desta view e silencioso: se o filtro de "em aberto" quebrar,
ela passa a mostrar a carteira somada ao que ja foi faturado — um numero grande,
plausivel e errado. Os testes ancoram o recorte e a separacao em relacao ao
faturamento de `mv_margem_item`.
"""

from decimal import Decimal

import pytest
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.core.models import Usuario, Vendedor
from tests.helpers import consulta, escalar, sem_csv

pytestmark = [pytest.mark.django_db, sem_csv]


def test_staging_carregado(carga):
    assert escalar("SELECT count(*) FROM stg_sc6") == 57_650


def test_apenas_a_ultima_foto_entra(carga):
    """`stg_sc6` acumula snapshots; a carteira e sempre o estado mais recente."""
    assert escalar(
        "SELECT count(DISTINCT dt_carga) FROM mv_carteira_aberta"
    ) == 1
    assert escalar("SELECT max(dt_carga) FROM mv_carteira_aberta") == escalar(
        "SELECT max(dt_carga) FROM stg_sc6"
    )


def test_so_linhas_em_aberto(carga):
    assert escalar("SELECT count(*) FROM mv_carteira_aberta") == 1_123
    # Item faturado por inteiro nao pode aparecer.
    assert escalar(
        "SELECT count(*) FROM mv_carteira_aberta "
        "WHERE nota_fiscal IS NOT NULL AND qtd_entregue >= qtd_pedida"
    ) == 0
    assert escalar("SELECT count(*) FROM mv_carteira_aberta WHERE qtd_aberta <= 0") == 0


def test_valor_em_aberto_e_a_parte_nao_entregue(carga):
    """`vlr_aberto` nao e o valor do pedido: e o que ainda falta sair.

    Numa entrega parcial o valor cheio contaria duas vezes — uma no faturamento,
    outra na carteira.
    """
    divergentes = escalar(
        "SELECT count(*) FROM mv_carteira_aberta "
        "WHERE vlr_aberto <> (qtd_pedida - qtd_entregue) * vlr_unitario"
    )
    assert divergentes == 0
    total = escalar("SELECT sum(vlr_aberto) FROM mv_carteira_aberta")
    assert total > Decimal("0")


def test_carteira_nao_entra_no_faturamento(carga):
    """As duas views vivem separadas: pedido em aberto nao e receita."""
    assert escalar("SELECT sum(receita_bruta) FROM mv_margem_item") == Decimal(
        "9760956.86"
    )


def test_pedido_traz_vendedor_e_cliente_do_sc5(carga):
    """O SC6 so tem o codigo do cliente; nome e vendedor vem do cabecalho."""
    with_vendedor = escalar(
        "SELECT count(*) FROM mv_carteira_aberta WHERE vendedor_codigo IS NOT NULL"
    )
    assert with_vendedor > 0
    # Pedido ausente do SC5 nao some da carteira — fica rotulado.
    canais = {
        linha["canal"] for linha in consulta("SELECT DISTINCT canal FROM mv_carteira_aberta")
    }
    assert canais
    assert canais <= {"Marketplace", "Venda interna", "Balcao-PDV", "(pedido sem cadastro)"}


def test_atraso_e_idade_calculados(carga):
    """`atrasado` compara a data de entrega prometida com hoje."""
    assert escalar(
        "SELECT count(*) FROM mv_carteira_aberta "
        "WHERE atrasado AND dt_entrega >= CURRENT_DATE"
    ) == 0
    assert escalar(
        "SELECT count(*) FROM mv_carteira_aberta "
        "WHERE dias_em_aberto IS NOT NULL AND dt_emissao IS NULL"
    ) == 0


def test_grupos_consolidados(carga):
    """A carteira publica os mesmos grupos da margem, nao os codigos crus."""
    from apps.core.models import MapaGrupo

    assert escalar(
        "SELECT count(*) FROM mv_carteira_aberta WHERE grupo_codigo = '0150'"
    ) == 0
    rotulos = {
        linha["grupo_rotulo"]
        for linha in consulta("SELECT DISTINCT grupo_rotulo FROM mv_carteira_aberta")
    }
    cadastro = set(MapaGrupo.objects.values_list("rotulo", flat=True))
    assert rotulos <= cadastro | {"Sem grupo"}


# --------------------------------------------------------------------------- #
# API — /api/v1/carteira
# --------------------------------------------------------------------------- #

ROTA = "/api/v1/carteira"


def _cliente(username: str, grupo: str, codigo_vendedor: str | None = None) -> APIClient:
    usuario = Usuario.objects.create_user(username=username, password="x")
    usuario.groups.add(Group.objects.get(name=grupo))
    if codigo_vendedor:
        Vendedor.objects.create(
            codigo=codigo_vendedor, nome=codigo_vendedor, usuario=usuario
        )
    c = APIClient()
    c.force_authenticate(user=usuario)
    return c


def test_resumo_bate_com_a_view(carga):
    """O resumo e do conjunto filtrado inteiro, nao da pagina exibida."""
    corpo = _cliente("cart_ger", "gerente").get(f"{ROTA}?limite=5").json()

    assert corpo["total"] == 1_123
    assert len(corpo["itens"]) == 5
    assert corpo["resumo"]["itens"] == 1_123
    assert Decimal(corpo["resumo"]["valor_aberto"]) == escalar(
        "SELECT sum(vlr_aberto) FROM mv_carteira_aberta"
    )


def test_paginacao_nao_muda_o_resumo(carga):
    c = _cliente("cart_pag", "gerente")
    primeira = c.get(f"{ROTA}?limite=10").json()
    segunda = c.get(f"{ROTA}?limite=10&offset=10").json()
    assert primeira["resumo"] == segunda["resumo"]
    assert {i["id"] for i in primeira["itens"]} & {i["id"] for i in segunda["itens"]} == set()


def test_filtro_de_situacao(carga):
    c = _cliente("cart_sit", "gerente")
    atrasados = c.get(f"{ROTA}?situacao=atrasados&limite=1").json()
    a_vencer = c.get(f"{ROTA}?situacao=a_vencer&limite=1").json()

    assert atrasados["total"] + a_vencer["total"] == 1_123
    assert atrasados["total"] == escalar(
        "SELECT count(*) FROM mv_carteira_aberta WHERE atrasado"
    )
    assert c.get(f"{ROTA}?situacao=talvez").status_code == 400


def test_busca_por_pedido_e_sku(carga):
    c = _cliente("cart_busca", "gerente")
    alvo = consulta("SELECT num_pedido, sku FROM mv_carteira_aberta LIMIT 1")[0]

    por_pedido = c.get(f"{ROTA}?busca={alvo['num_pedido']}").json()
    assert por_pedido["total"] >= 1
    assert all(i["num_pedido"] == alvo["num_pedido"] for i in por_pedido["itens"])

    assert c.get(f"{ROTA}?busca={alvo['sku']}").json()["total"] >= 1


def test_recorte_de_data_e_a_entrega(carga):
    """Na carteira o filtro de periodo olha `dt_entrega`, nao competencia."""
    c = _cliente("cart_data", "gerente")
    dentro = c.get(f"{ROTA}?competencia_inicio=2026-07&limite=1").json()
    fora = c.get(f"{ROTA}?competencia_fim=2020-01&limite=1").json()

    assert dentro["total"] > 0
    assert fora["total"] == 0


def test_ordenacao_desconhecida_retorna_400(carga):
    c = _cliente("cart_ord", "gerente")
    assert c.get(f"{ROTA}?ordenar=vlr_aberto;DROP TABLE").status_code == 400


def test_vendedor_ve_apenas_a_propria_carteira(carga):
    """Mesmo isolamento da margem: a restricao entra na clausula base."""
    codigo = escalar(
        "SELECT vendedor_codigo FROM mv_carteira_aberta "
        "WHERE vendedor_codigo IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1"
    )
    c = _cliente("cart_vend", "vendedor", codigo)

    corpo = c.get(f"{ROTA}?limite=500").json()
    assert corpo["total"] == escalar(
        "SELECT count(*) FROM mv_carteira_aberta WHERE vendedor_codigo = %s", [codigo]
    )
    assert corpo["total"] < 1_123
    assert {i["vendedor_codigo"] for i in corpo["itens"]} == {codigo}

    # E nem enxerga o colega na caixa de filtro.
    opcoes = c.get("/api/v1/carteira/filtros").json()["opcoes"]
    assert [v["codigo"] for v in opcoes["vendedores"]] == [codigo]


def test_filtro_explicito_nao_burla_o_escopo(carga):
    codigos = [
        linha["vendedor_codigo"]
        for linha in consulta(
            "SELECT vendedor_codigo FROM mv_carteira_aberta "
            "WHERE vendedor_codigo IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 2"
        )
    ]
    meu, outro = codigos[0], codigos[1]
    c = _cliente("cart_burla", "vendedor", meu)

    corpo = c.get(f"{ROTA}?vendedor={outro}&limite=500").json()
    assert corpo["total"] == 0
