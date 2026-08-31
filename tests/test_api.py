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
    "/api/v1/margem/pedidos",
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


def test_filtro_por_grupo_particiona_o_kpi(carga):
    """Os grupos oferecidos na tela particionam o KPI — inclusive 'Sem grupo',
    que e NULL na view."""
    c = cliente(cria_usuario("ger8", "gerente"))
    total = c.get("/api/v1/kpis").json()["kpis"]["linhas"]

    # So os que tem linha: a lista tambem oferece grupo cadastrado sem movimento,
    # e somar esses nao mudaria o total.
    codigos = [
        g["codigo"]
        for g in c.get("/api/v1/filtros").json()["opcoes"]["grupos"]
        if not g["sem_movimento"]
    ]
    por_grupo = {
        g: c.get(f"/api/v1/kpis?grupo={g}").json()["kpis"]["linhas"] for g in codigos
    }
    assert all(n > 0 for n in por_grupo.values())
    assert sum(por_grupo.values()) == total

    # 0150 continua consolidado em 0057: filtrar por ele nao devolve nada.
    assert c.get("/api/v1/kpis?grupo=0150").json()["kpis"]["linhas"] == 0


def test_filtro_de_grupo_aceita_varios_codigos(carga):
    """O marcador da tela manda `?grupo=a,b`: o recorte e a soma dos dois."""
    c = cliente(cria_usuario("ger8b", "gerente"))

    def linhas(q):
        return c.get(f"/api/v1/kpis?grupo={q}").json()["kpis"]["linhas"]

    assert linhas("0128,0057") == linhas("0128") + linhas("0057")
    # A sentinela do vazio (NULL na view) tem que somar junto com os demais.
    assert linhas("0128,Sem grupo") == linhas("0128") + linhas("Sem grupo")


def test_filtro_por_armazem_nao_quebra_o_ranking(carga):
    """Regressao: mv_margem_vendedor nao tinha armazem e o endpoint dava 500."""
    c = cliente(cria_usuario("ger9", "gerente"))
    resposta = c.get("/api/v1/margem/vendedor?armazem=02")
    assert resposta.status_code == 200
    assert len(resposta.json()["vendedores"]) > 0


def test_opcoes_em_cascata_de_armazem_para_grupo(carga):
    """Escolher o armazem reduz os grupos, mas nao a lista de armazens."""
    c = cliente(cria_usuario("ger10", "gerente"))
    tudo = c.get("/api/v1/filtros").json()["opcoes"]

    def com_linha(opcoes):
        return [g["codigo"] for g in opcoes["grupos"] if not g["sem_movimento"]]

    assert com_linha(tudo) == ["0057", "0128", "0129", "Sem grupo"]

    # O armazem 11 (Devolucao Marketplace) so tem Ecommerce.
    recorte = c.get("/api/v1/filtros?armazem=11").json()["opcoes"]
    assert com_linha(recorte) == ["0128"]
    # O cadastro continua listado, apagado: e por ele que se confere a
    # classificacao de um grupo que ainda nao apareceu no export.
    assert len(recorte["grupos"]) > 1
    # A propria dimensao nao se filtra: senao o usuario ficaria preso na escolha.
    assert len(recorte["armazens"]) == len(tudo["armazens"])


def test_armazem_traz_o_rotulo_de_negocio(carga):
    c = cliente(cria_usuario("ger11", "gerente"))
    armazens = {
        a["codigo"]: a["rotulo"]
        for a in c.get("/api/v1/filtros").json()["opcoes"]["armazens"]
    }
    assert armazens["02"] == "Barracao 02"
    assert armazens["20"] == "20 - sem cadastro"


def test_leitura_por_armazem_bate_com_o_kpi(carga):
    """A quebra armazem > grupo nao pode criar nem sumir com margem."""
    c = cliente(cria_usuario("ger12", "gerente"))
    linhas = c.get("/api/v1/margem/armazem").json()["armazens"]
    total = c.get("/api/v1/kpis").json()["kpis"]

    soma = sum(Decimal(linha["margem"]) for linha in linhas)
    assert soma == Decimal(total["margem_bruta"])
    assert sum(linha["linhas"] for linha in linhas) == total["linhas"]


# --------------------------------------------------------------------------- #
# Pedidos faturados (drill-down de Por armazem)
# --------------------------------------------------------------------------- #

def test_pedidos_reconciliam_com_a_leitura_por_armazem(carga):
    """A receita que entra no indicador tem que ser a mesma das duas telas.

    O total faturado e maior de proposito: as agregadas ja nascem cortadas por
    sem_custo/outlier/TES nao-venda, e faturamento nao se corta. Se os dois
    numeros empatassem, um dos dois estaria errado.
    """
    c = cliente(cria_usuario("ger_ped1", "gerente"))
    resumo = c.get("/api/v1/margem/pedidos?armazem=02").json()["resumo"]
    linhas = c.get("/api/v1/margem/armazem?armazem=02").json()["armazens"]

    assert Decimal(resumo["receita_no_kpi"]) == sum(
        Decimal(linha["receita"]) for linha in linhas
    )
    assert Decimal(resumo["margem"]) == sum(Decimal(linha["margem"]) for linha in linhas)
    assert Decimal(resumo["receita"]) > Decimal(resumo["receita_no_kpi"])
    assert resumo["itens_fora_do_kpi"] > 0


def test_pedido_abre_os_itens_que_somam_o_total(carga):
    c = cliente(cria_usuario("ger_ped2", "gerente"))
    primeiro = c.get("/api/v1/margem/pedidos?armazem=02&limite=1").json()["pedidos"][0]

    detalhe = c.get(f"/api/v1/margem/pedidos/{primeiro['chave']}?armazem=02").json()
    assert len(detalhe["itens"]) == primeiro["itens"]
    assert Decimal(detalhe["pedido"]["receita"]) == Decimal(primeiro["receita"])
    assert sum(Decimal(i["receita_bruta"]) for i in detalhe["itens"]) == Decimal(
        primeiro["receita"]
    )


def test_venda_de_balcao_e_identificada_pela_nota(carga):
    """Balcao nao tem pedido: o documento dela e a nota fiscal.

    Sem essa chave as linhas colapsariam num unico 'pedido vazio' — e agrupar por
    linha inventaria vendas que nao existiram.
    """
    c = cliente(cria_usuario("ger_ped3", "gerente"))
    dados = c.get("/api/v1/margem/pedidos?canal=Balcao-PDV&limite=5").json()

    assert dados["total"] == escalar(
        "SELECT count(DISTINCT (nota_fiscal, serie_nf)) FROM mv_margem_item "
        "WHERE num_pedido IS NULL"
    )
    assert all(p["origem"] == "pdv" for p in dados["pedidos"])
    assert all(p["chave"].startswith("NF-") for p in dados["pedidos"])

    # E a chave abre o detalhe, senao o olho da tela levaria a lugar nenhum.
    chave = dados["pedidos"][0]["chave"]
    assert c.get(f"/api/v1/margem/pedidos/{chave}").status_code == 200


def test_pedido_faturado_em_varias_notas_mostra_todas(carga):
    """Pedido e nota nao andam colados: 256 pedidos saem em mais de uma nota.

    Escolher uma delas para representar o pedido mentiria sobre qual documento
    faturou o que — por isso a lista conta e o detalhe lista.
    """
    c = cliente(cria_usuario("ger_ped7", "gerente"))
    numero = escalar(
        "SELECT num_pedido FROM mv_margem_item WHERE num_pedido IS NOT NULL "
        "GROUP BY 1 HAVING count(DISTINCT (nota_fiscal, serie_nf)) > 1 LIMIT 1"
    )
    detalhe = c.get(f"/api/v1/margem/pedidos/{numero}").json()["pedido"]

    assert len(detalhe["notas"]) > 1
    assert detalhe["notas"] == sorted(
        detalhe["notas"], key=lambda n: (n["nota_fiscal"], n["serie_nf"])
    )


def test_toda_linha_faturada_tem_nota(carga):
    """A nota e o documento do faturamento: linha sem ela nao e conferivel."""
    assert (
        escalar("SELECT count(*) FROM mv_margem_item WHERE nota_fiscal IS NULL") == 0
    )


def test_pedido_inexistente_ou_malformado_da_404(carga):
    c = cliente(cria_usuario("ger_ped4", "gerente"))
    assert c.get("/api/v1/margem/pedidos/ZZZZZZ").status_code == 404
    # Chave de nota que nao existe: 404, e nao erro de parsing.
    assert c.get("/api/v1/margem/pedidos/NF-9-000000").status_code == 404


def test_vendedor_nao_ve_pedido_de_colega(carga, dois_vendedores):
    """O escopo entra na clausula base: adivinhar o numero nao abre o pedido."""
    meu, outro = dois_vendedores
    usuario = cria_usuario("vend_ped", "vendedor", codigo_vendedor=meu)
    c = cliente(usuario)

    lista = c.get("/api/v1/margem/pedidos").json()["pedidos"]
    assert lista
    assert all(p["vendedor_codigo"] == meu for p in lista)

    alheio = escalar(
        "SELECT min(num_pedido) FROM mv_margem_item WHERE vendedor_codigo = %s",
        [outro],
    )
    assert c.get(f"/api/v1/margem/pedidos/{alheio}").status_code == 404


def test_sku_inexistente_da_404(carga):
    c = cliente(cria_usuario("ger_sku1", "gerente"))
    assert c.get("/api/v1/margem/sku/ZZZZZZ").status_code == 404


def test_vendedor_nao_ve_sku_de_colega(carga, dois_vendedores):
    """Escopo na clausula base: digitar o codigo do item nao abre o detalhe."""
    meu, outro = dois_vendedores
    usuario = cria_usuario("vend_sku", "vendedor", codigo_vendedor=meu)
    c = cliente(usuario)

    alheio = escalar(
        "SELECT sku FROM mv_margem_item WHERE vendedor_codigo = %s "
        "AND sku NOT IN (SELECT sku FROM mv_margem_item WHERE vendedor_codigo = %s) "
        "LIMIT 1",
        [outro, meu],
    )
    assert alheio, "baseline sem SKU exclusivo do colega"
    assert c.get(f"/api/v1/margem/sku/{alheio}").status_code == 404


def test_vendedor_nao_ve_estoque_nem_compras(carga, dois_vendedores):
    """SB2 e SD1 nao tem vendedor_codigo — sem coluna, sem escopo, sem bloco.

    Devolver estoque e historico de compras a um vendedor seria vazamento por
    uma porta que a clausula base nao alcanca.
    """
    meu, _ = dois_vendedores
    c = cliente(cria_usuario("vend_sup", "vendedor", codigo_vendedor=meu))
    sku = c.get("/api/v1/margem/sku?limite=1").json()["itens"][0]["sku"]

    corpo = c.get(f"/api/v1/margem/sku/{sku}").json()
    assert corpo["suprimentos_visiveis"] is False
    assert corpo["estoque"] == []
    assert corpo["compras"] == []

    gerente = cliente(cria_usuario("ger_sku2", "gerente"))
    assert gerente.get(f"/api/v1/margem/sku/{sku}").json()["suprimentos_visiveis"]


def test_ordenacao_desconhecida_de_sku_da_400(carga):
    c = cliente(cria_usuario("ger_sku3", "gerente"))
    sku = c.get("/api/v1/margem/sku?limite=1").json()["itens"][0]["sku"]
    assert c.get(f"/api/v1/margem/sku/{sku}?ordenar=lucro").status_code == 400


def test_paginacao_de_sku_respeita_limite_e_offset(carga):
    c = cliente(cria_usuario("ger_sku4", "gerente"))
    sku = escalar(
        "SELECT sku FROM mv_margem_item GROUP BY sku HAVING count(*) > 10 LIMIT 1", []
    )
    pagina1 = c.get(f"/api/v1/margem/sku/{sku}?limite=5").json()
    pagina2 = c.get(f"/api/v1/margem/sku/{sku}?limite=5&offset=5").json()

    assert len(pagina1["pedidos"]) == 5
    assert pagina1["total"] == pagina2["total"]
    # O cabecalho e do conjunto inteiro: virar a pagina nao pode mexer nele.
    assert pagina1["sku"] == pagina2["sku"]


def test_ordenacao_desconhecida_de_pedido_da_400(carga):
    c = cliente(cria_usuario("ger_ped5", "gerente"))
    assert c.get("/api/v1/margem/pedidos?ordenar=lucro").status_code == 400


def test_paginacao_de_pedidos_respeita_limite_e_offset(carga):
    c = cliente(cria_usuario("ger_ped6", "gerente"))
    pagina1 = c.get("/api/v1/margem/pedidos?armazem=02&limite=5").json()
    pagina2 = c.get("/api/v1/margem/pedidos?armazem=02&limite=5&offset=5").json()

    assert len(pagina1["pedidos"]) == 5
    assert pagina1["total"] == pagina2["total"]
    # O resumo e do conjunto inteiro: virar a pagina nao pode mexer nele.
    assert pagina1["resumo"] == pagina2["resumo"]
    chaves1 = {p["chave"] for p in pagina1["pedidos"]}
    assert chaves1.isdisjoint({p["chave"] for p in pagina2["pedidos"]})
