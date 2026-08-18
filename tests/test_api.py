"""API e isolamento entre perfis.

O teste central e o de vazamento: um vendedor nao pode ver linha de outro nem do
canal Marketplace, por nenhum endpoint — incluindo agregados, listas de filtro e
contagens.
"""

from decimal import Decimal

import pytest
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.core.models import Usuario, Vendedor
from tests.helpers import escalar, sem_csv

pytestmark = [pytest.mark.django_db, sem_csv]

# Endpoints que devolvem dado analitico e, portanto, precisam respeitar o escopo.
ENDPOINTS = [
    "/api/v1/kpis",
    "/api/v1/margem/serie",
    "/api/v1/margem/vendedor",
    "/api/v1/margem/sku",
    "/api/v1/filtros",
    "/api/v1/carteira",
    "/api/v1/carteira/filtros",
]


def cliente(usuario) -> APIClient:
    c = APIClient()
    c.force_authenticate(user=usuario)
    return c


def cria_usuario(username: str, grupo: str, codigo_vendedor: str | None = None):
    usuario = Usuario.objects.create_user(username=username, password="x")
    usuario.groups.add(Group.objects.get(name=grupo))
    if codigo_vendedor:
        nome = escalar(
            "SELECT max(vendedor_nome) FROM mv_margem_item WHERE vendedor_codigo = %s",
            [codigo_vendedor],
        )
        Vendedor.objects.create(
            codigo=codigo_vendedor, nome=nome or codigo_vendedor, usuario=usuario
        )
    return usuario


@pytest.fixture
def dois_vendedores(carga):
    """Os dois vendedores internos com maior receita."""
    linhas = escalar(
        "SELECT array_agg(vendedor_codigo ORDER BY receita DESC) FROM ("
        "  SELECT vendedor_codigo, sum(receita) receita FROM mv_margem_vendedor"
        "  GROUP BY 1) t"
    )
    return linhas[0], linhas[1]


# --------------------------------------------------------------------------- #
# Autenticacao
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("rota", ENDPOINTS)
def test_exige_autenticacao(carga, rota):
    assert APIClient().get(rota).status_code == 401


def test_usuario_sem_perfil_e_recusado(carga):
    usuario = Usuario.objects.create_user(username="sem_perfil", password="x")
    assert cliente(usuario).get("/api/v1/kpis").status_code == 403


def test_vendedor_sem_vinculo_e_recusado(carga):
    """Sem vinculo, devolver tudo seria vazamento; devolver vazio esconderia o erro."""
    usuario = Usuario.objects.create_user(username="orfao", password="x")
    usuario.groups.add(Group.objects.get(name="vendedor"))
    resposta = cliente(usuario).get("/api/v1/kpis")
    assert resposta.status_code == 403
    assert "vinculo" in resposta.json()["detail"].lower()


# --------------------------------------------------------------------------- #
# Isolamento do perfil vendedor
# --------------------------------------------------------------------------- #

def test_vendedor_ve_apenas_a_propria_receita(carga, dois_vendedores):
    meu, outro = dois_vendedores
    usuario = cria_usuario("vend_a", "vendedor", meu)

    dados = cliente(usuario).get("/api/v1/kpis").json()["kpis"]
    esperado = escalar(
        "SELECT sum(receita_bruta) FROM mv_margem_item "
        "WHERE vendedor_codigo = %s AND NOT sem_custo AND NOT outlier_custo",
        [meu],
    )
    assert Decimal(dados["receita_bruta"]) == esperado

    total = escalar(
        "SELECT sum(receita_bruta) FROM mv_margem_item "
        "WHERE NOT sem_custo AND NOT outlier_custo"
    )
    assert Decimal(dados["receita_bruta"]) < total


def test_vendedor_nao_ve_ranking_de_colegas(carga, dois_vendedores):
    meu, outro = dois_vendedores
    usuario = cria_usuario("vend_b", "vendedor", meu)

    vendedores = cliente(usuario).get("/api/v1/margem/vendedor").json()["vendedores"]
    codigos = {v["vendedor_codigo"] for v in vendedores}
    assert codigos == {meu}
    assert outro not in codigos


def test_vendedor_nao_ve_marketplace(carga, dois_vendedores):
    """Marketplace tem vendedor_codigo nulo — fica naturalmente fora do escopo."""
    meu, _ = dois_vendedores
    usuario = cria_usuario("vend_c", "vendedor", meu)
    c = cliente(usuario)

    canais = {linha["canal"] for linha in c.get("/api/v1/margem/serie").json()["serie"]}
    assert "Marketplace" not in canais
    assert c.get("/api/v1/filtros").json()["opcoes"]["canais"] == ["Venda interna"]


def test_vendedor_nao_ve_colega_na_lista_de_filtros(carga, dois_vendedores):
    meu, outro = dois_vendedores
    usuario = cria_usuario("vend_d", "vendedor", meu)

    opcoes = cliente(usuario).get("/api/v1/filtros").json()["opcoes"]
    assert [v["codigo"] for v in opcoes["vendedores"]] == [meu]


def test_filtro_explicito_nao_burla_o_escopo(carga, dois_vendedores):
    """Pedir explicitamente o codigo do colega nao pode devolver dado dele."""
    meu, outro = dois_vendedores
    usuario = cria_usuario("vend_e", "vendedor", meu)

    dados = cliente(usuario).get(f"/api/v1/kpis?vendedor={outro}").json()["kpis"]
    assert Decimal(dados["receita_bruta"] or 0) == 0
    assert dados["linhas"] == 0


# --------------------------------------------------------------------------- #
# Gerente e admin
# --------------------------------------------------------------------------- #

def test_gerente_ve_tudo(carga):
    usuario = cria_usuario("ger", "gerente")
    dados = cliente(usuario).get("/api/v1/kpis").json()["kpis"]
    esperado = escalar(
        "SELECT sum(receita_bruta) FROM mv_margem_item "
        "WHERE NOT sem_custo AND NOT outlier_custo"
    )
    assert Decimal(dados["receita_bruta"]) == esperado


def test_gerente_nao_altera_regra_de_negocio(carga):
    """Gerente le o BI inteiro, mas nao mexe em cadastro."""
    usuario = cria_usuario("ger2", "gerente")
    assert not usuario.has_perm("core.change_paramoutlier")
    assert not usuario.has_perm("core.add_reclassificacaosku")


def test_admin_altera_regra_de_negocio(carga):
    usuario = cria_usuario("adm", "admin")
    assert usuario.has_perm("core.change_paramoutlier")
    assert usuario.has_perm("core.add_reclassificacaosku")


# --------------------------------------------------------------------------- #
# Contrato de resposta — escopo do calculo
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("rota", ENDPOINTS)
def test_toda_resposta_declara_margem_bruta(carga, rota):
    """O frontend usa este bloco para rotular as telas. Nao pode faltar."""
    usuario = cria_usuario(f"ger_{rota.count('/')}{abs(hash(rota)) % 9999}", "gerente")
    escopo = cliente(usuario).get(rota).json()["escopo"]

    assert escopo["tipo"] == "margem_bruta"
    assert "comissao de marketplace" in escopo["nao_inclui"]
    # Trava a regra de UI: comparacao entre canais so na fase 2.
    assert escopo["comparacao_entre_canais"] is False


def test_kpis_conferem_com_o_baseline(carga):
    usuario = cria_usuario("ger3", "gerente")
    kpis = cliente(usuario).get("/api/v1/kpis").json()["kpis"]

    # As contagens de linha excluida (sem_custo / outlier) sao verificadas em
    # test_margem.py::test_flags_de_qualidade, direto na view.
    assert round(Decimal(kpis["margem_pct"]) * 100, 1) == Decimal("25.9")


# --------------------------------------------------------------------------- #
# Validacao de entrada
# --------------------------------------------------------------------------- #

def test_competencia_invalida_retorna_400(carga):
    usuario = cria_usuario("ger4", "gerente")
    resposta = cliente(usuario).get("/api/v1/kpis?competencia_inicio=julho")
    assert resposta.status_code == 400


def test_periodo_invertido_retorna_400(carga):
    usuario = cria_usuario("ger5", "gerente")
    resposta = cliente(usuario).get(
        "/api/v1/kpis?competencia_inicio=2026-08&competencia_fim=2026-07"
    )
    assert resposta.status_code == 400


def test_ordenacao_desconhecida_retorna_400(carga):
    """Coluna de ordenacao vem de lista fixa — query string nao vira SQL."""
    usuario = cria_usuario("ger6", "gerente")
    resposta = cliente(usuario).get("/api/v1/margem/sku?ordenar=receita;DROP TABLE")
    assert resposta.status_code == 400


def test_filtro_por_competencia_funciona(carga):
    usuario = cria_usuario("ger7", "gerente")
    c = cliente(usuario)
    dentro = c.get("/api/v1/kpis?competencia_inicio=2026-07&competencia_fim=2026-07")
    fora = c.get("/api/v1/kpis?competencia_inicio=2026-09")

    assert dentro.json()["kpis"]["linhas"] > 0
    assert fora.json()["kpis"]["linhas"] == 0
