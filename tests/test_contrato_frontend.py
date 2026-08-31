"""Contrato entre a API e o SPA.

Os schemas Zod em `frontend/src/api/tipos.ts` sao a leitura que o frontend faz de
cada resposta. Se a API mudar de forma sem que estes testes quebrem primeiro, o
erro so aparece no navegador do usuario — e como Zod valida em runtime, aparece
como tela em branco, nao como aviso.

Cada teste aqui espelha um schema do arquivo acima.
"""

import pytest
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.core.models import Usuario
from tests.helpers import sem_csv

pytestmark = [pytest.mark.django_db, sem_csv]

CHAVES_ESCOPO = {
    "tipo",
    "rotulo",
    "formula",
    "nao_inclui",
    "aviso_marketplace",
    "comparacao_entre_canais",
}


@pytest.fixture
def gerente(carga):
    usuario = Usuario.objects.create_user(username="contrato", password="x")
    usuario.groups.add(Group.objects.get(name="gerente"))
    cliente = APIClient()
    cliente.force_authenticate(user=usuario)
    return cliente


def test_kpis(gerente):
    corpo = gerente.get("/api/v1/kpis").json()
    assert CHAVES_ESCOPO <= set(corpo["escopo"])
    assert {
        "receita_bruta",
        "desconto_total",
        "receita_liquida",
        "margem_liquida",
        "margem_liquida_pct",
        "custo_total",
        "margem_bruta",
        "margem_pct",
        "ticket_medio",
        "pedidos",
        "skus",
        "linhas",
        "quantidade",
    } <= set(corpo["kpis"])


def test_serie(gerente):
    corpo = gerente.get("/api/v1/margem/serie").json()
    assert corpo["granularidade"] in ("dia", "mes")
    assert {
        "periodo",
        "canal",
        "receita",
        "receita_liquida",
        "desconto",
        "custo",
        "margem",
        "margem_liquida",
        "margem_pct",
        "pedidos",
    } <= set(corpo["serie"][0])


def test_serie_diaria(gerente):
    corpo = gerente.get("/api/v1/margem/serie?granularidade=dia").json()
    assert corpo["granularidade"] == "dia"
    assert len(corpo["serie"]) > 0


def test_vendedores(gerente):
    corpo = gerente.get("/api/v1/margem/vendedor").json()
    assert "observacao" in corpo
    assert {
        "vendedor_codigo",
        "vendedor_nome",
        "canal",
        "receita",
        "receita_liquida",
        "desconto",
        "margem_liquida",
        "custo",
        "margem",
        "margem_pct",
        "pedidos",
        "linhas",
    } <= set(corpo["vendedores"][0])


def test_skus(gerente):
    corpo = gerente.get("/api/v1/margem/sku").json()
    assert {"total", "limite", "offset", "itens"} <= set(corpo)
    assert {
        "sku",
        "descricao",
        "grupo",
        "quantidade",
        "receita",
        "receita_liquida",
        "desconto",
        "margem_liquida",
        "custo",
        "margem",
        "margem_pct",
    } <= set(corpo["itens"][0])


def test_filtros(gerente):
    opcoes = gerente.get("/api/v1/filtros").json()["opcoes"]
    assert {
        "canais",
        "grupos",
        "armazens",
        "vendedores",
        "tes",
        "competencias",
    } <= set(opcoes)
    assert {"codigo", "conta_como_venda"} <= set(opcoes["tes"][0])
    # `sem_movimento` marca o grupo que so existe no cadastro (espelha
    # `filtrosSchema.opcoes.grupos` em tipos.ts).
    assert {"codigo", "rotulo", "sem_movimento"} <= set(opcoes["grupos"][0])

    # `Filtros.grupo` e `string[]` em tipos.ts: o marcador da tela manda os
    # codigos separados por virgula, e a API precisa aceitar mais de um.
    codigos = [g["codigo"] for g in opcoes["grupos"]][:2]
    assert gerente.get(f"/api/v1/kpis?grupo={','.join(codigos)}").status_code == 200
    # Armazem tambem e {codigo, rotulo}: a tela mostra o nome, filtra pelo codigo.
    assert {"codigo", "rotulo"} <= set(opcoes["armazens"][0])
    assert {"codigo", "nome"} <= set(opcoes["vendedores"][0])


def test_armazens(gerente):
    """Espelha `armazensSchema` — uma linha por par armazem x grupo."""
    linhas = gerente.get("/api/v1/margem/armazem").json()["armazens"]
    assert {
        "armazem",
        "armazem_rotulo",
        "grupo_codigo",
        "grupo_rotulo",
        "receita",
        "receita_liquida",
        "desconto",
        "custo",
        "margem",
        "margem_liquida",
        "margem_pct",
        "pedidos",
        "linhas",
        "quantidade",
    } <= set(linhas[0])


def test_eu(gerente):
    corpo = gerente.get("/api/v1/auth/eu").json()
    assert {"username", "nome", "perfis", "vendedor"} <= set(corpo)


def test_valores_monetarios_sao_texto(gerente):
    """O SPA converte para Number so na exibicao.

    Se a API voltar a serializar Decimal como float, os centavos somem e a tela
    passa a divergir do fechamento do financeiro.
    """
    kpis = gerente.get("/api/v1/kpis").json()["kpis"]
    for campo in ("receita_bruta", "custo_total", "margem_bruta", "ticket_medio"):
        assert isinstance(kpis[campo], str), f"{campo} deveria ser string, veio float"


def test_contagens_sao_inteiras(gerente):
    """`sum()` sobre bigint volta numeric no Postgres, e Decimal sai como texto.

    O Zod do SPA espera number nesses campos — se voltar string, a tela some.
    """
    serie = gerente.get("/api/v1/margem/serie").json()["serie"][0]
    assert isinstance(serie["pedidos"], int), "pedidos deveria ser int, veio string"

    vendedor = gerente.get("/api/v1/margem/vendedor").json()["vendedores"][0]
    for campo in ("pedidos", "linhas"):
        assert isinstance(vendedor[campo], int), f"{campo} deveria ser int, veio string"


def test_margem_pct_e_fracao(gerente):
    """A UI formata com Intl percent, que espera fracao (0.258), nao 25.8."""
    valor = float(gerente.get("/api/v1/kpis").json()["kpis"]["margem_pct"])
    assert 0 < valor < 1


def test_carteira(gerente):
    """Espelha `carteiraSchema`. A tela le `resumo` e `itens` na mesma resposta."""
    corpo = gerente.get("/api/v1/carteira?limite=1").json()
    assert CHAVES_ESCOPO <= set(corpo["escopo"])
    assert {"total", "limite", "offset", "resumo", "itens", "observacao"} <= set(corpo)
    assert {
        "itens",
        "pedidos",
        "skus",
        "quantidade",
        "valor_aberto",
        "custo_previsto",
        "margem_prevista",
        "margem_prevista_pct",
        "valor_medio_pedido",
        "itens_atrasados",
        "valor_atrasado",
        "itens_sem_custo",
        "itens_sem_cadastro",
        "dt_foto",
        "entrega_min",
        "entrega_max",
    } <= set(corpo["resumo"])
    assert {
        "id",
        "num_pedido",
        "sku",
        "descricao",
        "grupo",
        "armazem",
        "armazem_rotulo",
        "canal",
        "vendedor_codigo",
        "vendedor_nome",
        "cod_cliente",
        "nome_cliente",
        "dt_emissao",
        "dt_entrega",
        "dias_em_aberto",
        "atrasado",
        "qtd_pedida",
        "qtd_entregue",
        "qtd_aberta",
        "vlr_unitario",
        "vlr_aberto",
        "custo_aberto",
        "margem_prevista",
        "margem_prevista_pct",
        "sem_custo",
    } <= set(corpo["itens"][0])


def test_carteira_filtros(gerente):
    """Espelha `carteiraFiltrosSchema` — lista propria, nao a de `/filtros`."""
    opcoes = gerente.get("/api/v1/carteira/filtros").json()["opcoes"]
    assert {"canais", "grupos", "armazens", "vendedores"} == set(opcoes)
    assert all({"codigo", "rotulo", "sem_movimento"} <= set(g) for g in opcoes["grupos"])
    assert all({"codigo", "rotulo"} <= set(a) for a in opcoes["armazens"])
    assert all({"codigo", "nome"} <= set(v) for v in opcoes["vendedores"])
