"""Views de margem contra o baseline de 07/2026.

Divergencia aqui significa bug no ETL ou na view, nao mudanca de negocio.
Os numeros esperados estao em `data/stack.md` secao 9.

Reancorados no export de 08/2026, que trouxe `Custo` (D2_CUSTO1), `Grupo`,
`Tipo Saida` e `Desconto` no SD2. O custo congelado passou a atender 98,8% das
linhas, entao os totais mudaram por mudanca de **fonte do custo**, nao de regra.
"""

from decimal import Decimal

import pytest
from django.core.management import call_command

from tests.helpers import ORIGEM, atualizar_views, consulta, escalar, sem_csv

# Sem transaction=True: o flush apagaria as sementes das migrations (MapaCanal,
# MapaGrupo, ParamOutlier) e os dados carregados pela fixture de sessao. Cada teste
# roda em uma transacao que sofre rollback, e o refresh usa o modo nao concorrente.
pytestmark = [pytest.mark.django_db, sem_csv]


# --------------------------------------------------------------------------- #
# Baseline
# --------------------------------------------------------------------------- #

def test_linhas_carregadas(carga):
    assert escalar("SELECT count(*) FROM stg_sd2") == 38_047
    assert escalar("SELECT count(*) FROM stg_sc5") == 35_440
    assert escalar("SELECT count(*) FROM stg_sb2") == 72_280
    assert escalar("SELECT count(*) FROM stg_sd1") == 185_297
    assert escalar("SELECT count(*) FROM mv_margem_item") == 38_047


def test_receita_total(carga):
    assert escalar("SELECT sum(receita_bruta) FROM mv_margem_item") == Decimal(
        "9760956.86"
    )


def test_desconto_nao_esta_abatido_da_receita_bruta(carga):
    """O Protheus registra o desconto a parte: Vlr.Total continua sendo Qtd x Unit.

    Sao R$ 1.186.557 — 12% do faturamento. Somar a receita bruta como se fosse o
    valor cobrado inflaria a margem em 10 pontos percentuais.
    """
    assert escalar("SELECT sum(desconto) FROM mv_margem_item") == Decimal("1186557.02")
    assert escalar("SELECT sum(receita_liquida) FROM mv_margem_item") == Decimal(
        "8574399.84"
    )
    assert escalar(
        "SELECT count(*) FROM mv_margem_item "
        "WHERE receita_liquida <> receita_bruta - desconto"
    ) == 0


def test_margem_global(carga):
    pct = escalar(
        "SELECT round(100 * sum(margem_bruta) / sum(receita_bruta), 1) "
        "FROM mv_margem_item WHERE NOT sem_custo"
    )
    assert pct == Decimal("23.7")


def test_margem_sem_outliers(carga):
    pct = escalar(
        "SELECT round(100 * sum(margem_bruta) / sum(receita_bruta), 1) "
        "FROM mv_margem_item WHERE NOT sem_custo AND NOT outlier_custo"
    )
    assert pct == Decimal("25.9")


def test_margem_liquida_convive_com_a_bruta(carga):
    """As duas medidas saem da mesma linha: a escolha e do leitor, nao da view."""
    bruta, liquida = consulta(
        "SELECT round(100 * sum(margem_bruta) / sum(receita_bruta), 1) bruta, "
        "       round(100 * sum(margem_liquida) / sum(receita_liquida), 1) liquida "
        "FROM mv_margem_item WHERE NOT sem_custo AND NOT outlier_custo AND tes_receita"
    )[0].values()
    assert bruta == Decimal("25.9")
    assert liquida == Decimal("15.7")


def test_flags_de_qualidade(carga):
    assert escalar("SELECT count(*) FROM mv_margem_item WHERE sem_custo") == 65
    assert escalar("SELECT count(*) FROM mv_margem_item WHERE outlier_custo") == 193


def test_cascata_de_custo(carga):
    origens = {
        linha["origem_custo"]: linha["n"]
        for linha in consulta(
            "SELECT origem_custo, count(*) n FROM mv_margem_item GROUP BY 1"
        )
    }
    # D2_CUSTO1 (custo congelado na saida) cobre 98,8% das linhas desde 08/2026.
    assert origens["saida"] == 37_578
    assert origens["ultima_compra"] == 217
    assert origens["medio"] == 148
    assert origens["outro_armazem"] == 39
    assert origens[None] == 65


def test_custo_da_saida_e_total_da_linha(carga):
    """`Custo` do SD2 e o custo da LINHA, nao o unitario.

    Confundir os dois multiplicaria o custo pela quantidade duas vezes. O teste
    fixa a semantica em uma linha de quantidade maior que 1.
    """
    linha = consulta(
        "SELECT d.quantidade, d.custo_saida, m.custo_unitario_ref, m.custo_total "
        "FROM mv_margem_item m JOIN stg_sd2 d ON d.id = m.id "
        "WHERE d.quantidade > 1 AND d.custo_saida > 0 AND m.origem_custo = 'saida' "
        "LIMIT 1"
    )[0]
    assert linha["custo_unitario_ref"] == linha["custo_saida"] / linha["quantidade"]
    assert abs(linha["custo_total"] - linha["custo_saida"]) < Decimal("0.01")


# --------------------------------------------------------------------------- #
# Regra 1 — canal e vendedor sao dimensoes distintas
# --------------------------------------------------------------------------- #

def test_canais(carga):
    canais = {
        linha["canal"]: (linha["n"], linha["receita"])
        for linha in consulta(
            "SELECT canal, count(*) n, sum(receita_bruta) receita "
            "FROM mv_margem_item GROUP BY 1"
        )
    }
    assert canais["Marketplace"] == (33_423, Decimal("6700162.94"))
    assert canais["Balcao-PDV"][0] == 555
    assert canais["(pedido sem cadastro)"][0] == 581


def test_integrador_nao_vira_vendedor(carga):
    """O codigo 72 e o Lexos, nao uma pessoa: fica fora do ranking de vendedor."""
    assert (
        escalar(
            "SELECT count(*) FROM mv_margem_item "
            "WHERE canal = 'Marketplace' AND vendedor_codigo IS NOT NULL"
        )
        == 0
    )
    assert escalar("SELECT count(*) FROM mv_margem_vendedor "
                   "WHERE vendedor_codigo = '72'") == 0


def test_pdv_nao_some_do_faturamento(carga):
    """Venda de balcao nao tem pedido no SC5 — precisa aparecer, nao sumir no join."""
    assert escalar(
        "SELECT sum(receita_bruta) FROM mv_margem_item WHERE canal = 'Balcao-PDV'"
    ) == Decimal("32048.83")


def test_pedido_sem_cadastro_preserva_receita(carga):
    """4,6% da receita tem pedido ausente no SC5 (janela de exportacao curta)."""
    assert escalar(
        "SELECT sum(receita_bruta) FROM mv_margem_item "
        "WHERE canal = '(pedido sem cadastro)'"
    ) == Decimal("454091.01")


def test_nota_com_multiplos_pedidos_nao_duplica_receita(carga):
    """O SC5 tem 257 pedidos com 2+ notas. Sem DISTINCT ON a receita duplicaria."""
    assert escalar("SELECT sum(receita_bruta) FROM mv_margem_item") == escalar(
        "SELECT sum(vlr_total) FROM stg_sd2"
    )


# --------------------------------------------------------------------------- #
# Regra 4 — grupo sem classificacao
# --------------------------------------------------------------------------- #

def test_sem_classificacao_visivel(carga):
    linhas = escalar(
        "SELECT count(*) FROM mv_margem_item WHERE grupo_codigo IS NULL"
    )
    receita = escalar(
        "SELECT sum(receita_bruta) FROM mv_margem_item WHERE grupo_codigo IS NULL"
    )
    assert linhas == 2_232
    assert receita == Decimal("1088765.98")
    # Nunca somado silenciosamente em outro grupo.
    assert escalar(
        "SELECT count(*) FROM mv_margem_item "
        "WHERE grupo_codigo IS NULL AND grupo_rotulo <> '(sem classificacao)'"
    ) == 0


def test_reclassificacao_de_sku_tem_precedencia(carga):
    from apps.core.models import ReclassificacaoSKU

    sku = escalar(
        "SELECT sku FROM mv_margem_item WHERE grupo_codigo IS NULL LIMIT 1"
    )
    ReclassificacaoSKU.objects.create(sku=sku, grupo_id="0057")
    atualizar_views()

    assert escalar(
        "SELECT DISTINCT grupo_codigo FROM mv_margem_item WHERE sku = %s", [sku]
    ) == "0057"
    assert escalar(
        "SELECT bool_and(grupo_reclassificado) FROM mv_margem_item WHERE sku = %s",
        [sku],
    ) is True


# --------------------------------------------------------------------------- #
# Regra 2 — corte de outlier parametrizavel
# --------------------------------------------------------------------------- #

def test_corte_de_outlier_e_parametrizavel(carga):
    from apps.core.models import ParamOutlier

    ParamOutlier.objects.update_or_create(id=1, defaults={"limite": Decimal("-2.0")})
    atualizar_views()
    mais_conservador = escalar(
        "SELECT count(*) FROM mv_margem_item WHERE outlier_custo"
    )

    ParamOutlier.objects.update_or_create(id=1, defaults={"limite": Decimal("-1.0")})
    atualizar_views()

    assert mais_conservador < 193
    assert escalar("SELECT count(*) FROM mv_margem_item WHERE outlier_custo") == 193


def test_prejuizo_plausivel_permanece_no_kpi(carga):
    """Margem entre o corte e zero fica no KPI: e prejuizo real, nao erro."""
    assert (
        escalar(
            "SELECT count(*) FROM mv_margem_item "
            "WHERE margem_pct < 0 AND margem_pct >= -1.0 AND NOT outlier_custo"
        )
        > 0
    )


# --------------------------------------------------------------------------- #
# Carga incremental
# --------------------------------------------------------------------------- #

def test_carga_e_idempotente(carga):
    """Rodar duas vezes nao duplica faturamento — valida o DELETE por competencia."""
    antes = escalar("SELECT sum(receita_bruta) FROM mv_margem_item")
    linhas_antes = escalar("SELECT count(*) FROM stg_sd2")

    call_command("carregar_protheus", origem=ORIGEM, sem_refresh=True, verbosity=0)
    atualizar_views()

    assert escalar("SELECT count(*) FROM stg_sd2") == linhas_antes
    assert escalar("SELECT sum(receita_bruta) FROM mv_margem_item") == antes


def test_duplicatas_legitimas_preservadas(carga):
    """187 itens repetidos na mesma NF sao faturamento real, nao ruido."""
    distintas = escalar(
        "SELECT count(*) FROM (SELECT DISTINCT filial, num_docto, serie, produto "
        "FROM stg_sd2) t"
    )
    assert escalar("SELECT count(*) FROM stg_sd2") - distintas == 187


def test_snapshot_congela_margem_de_mes_fechado(carga):
    """Alterar o custo atual do SB2 nao pode mexer na margem de um mes ja fechado.

    Com o D2_CUSTO1 no export, 98,8% das linhas ja nao dependem do SB2. O snapshot
    continua sendo o que protege as outras 469.
    """
    from django.db import connection

    antes = escalar("SELECT sum(margem_bruta) FROM mv_margem_item WHERE NOT sem_custo")

    # Nova fotografia de custo, posterior a competencia da venda.
    with connection.cursor() as cur:
        cur.execute(
            "INSERT INTO stg_sb2 (filial, produto, armazem, descricao, "
            "vlr_ult_compra, saldo_atual, sld_atu, custo_unitario, grupo, dt_carga) "
            "SELECT filial, produto, armazem, descricao, vlr_ult_compra * 3, "
            "saldo_atual, sld_atu, custo_unitario * 3, grupo, "
            "dt_carga + INTERVAL '1 month' FROM stg_sb2"
        )
    atualizar_views()

    depois = escalar("SELECT sum(margem_bruta) FROM mv_margem_item WHERE NOT sem_custo")
    assert depois == antes, "margem de mes fechado mudou apos nova carga do SB2"


# --------------------------------------------------------------------------- #
# Tipo de saida (D2_TES)
# --------------------------------------------------------------------------- #

def test_tes_conta_como_venda_por_padrao(carga):
    """Nenhum codigo e excluido por suposicao: sem cadastro, o TES e venda."""
    assert escalar("SELECT count(*) FROM mv_margem_item WHERE NOT tes_receita") == 0
    assert escalar("SELECT count(DISTINCT tes) FROM mv_margem_item") == 32


def test_tes_desmarcado_sai_do_kpi_mas_nao_do_faturamento(carga):
    """Remessa e bonificacao saem da margem; a receita total continua a mesma."""
    from apps.core.models import MapaTES

    faturamento = escalar("SELECT sum(receita_bruta) FROM mv_margem_item")
    kpi_antes = escalar("SELECT sum(margem) FROM mv_margem_diaria")

    MapaTES.objects.filter(codigo="670").update(gera_receita=False)
    atualizar_views()

    assert escalar("SELECT sum(receita_bruta) FROM mv_margem_item") == faturamento
    assert escalar("SELECT count(*) FROM mv_margem_item WHERE NOT tes_receita") == 3_281
    assert escalar("SELECT sum(margem) FROM mv_margem_diaria") < kpi_antes

    MapaTES.objects.filter(codigo="670").update(gera_receita=True)
    atualizar_views()
    assert escalar("SELECT sum(margem) FROM mv_margem_diaria") == kpi_antes


# --------------------------------------------------------------------------- #
# Grupo: precedencia da linha faturada sobre o cadastro
# --------------------------------------------------------------------------- #

def test_grupo_da_linha_faturada_vence_o_cadastro_do_sb2(carga):
    """O grupo do SD2 e o do momento da venda; o do SB2 e o cadastro de hoje."""
    divergentes = escalar(
        "SELECT count(*) FROM mv_margem_item m JOIN stg_sd2 d ON d.id = m.id "
        "WHERE d.grupo_doc IS NOT NULL AND m.grupo_codigo <> d.grupo_doc "
        "  AND NOT m.grupo_reclassificado"
    )
    assert divergentes == 0


def test_grupo_do_sb2_ainda_e_o_fallback(carga):
    """Linha faturada sem grupo nao vira '(sem classificacao)' se o SB2 souber."""
    assert escalar(
        "SELECT count(*) FROM mv_margem_item m JOIN stg_sd2 d ON d.id = m.id "
        "WHERE d.grupo_doc IS NULL AND m.grupo_codigo IS NOT NULL"
    ) > 0


# --------------------------------------------------------------------------- #
# SD1 — staging apenas (fase 1 nao usa)
# --------------------------------------------------------------------------- #

def test_sd1_carregado_mas_fora_da_margem(carga):
    """As entradas entram no staging sem tocar no faturamento da fase 1.

    O export atual cobre 46 competencias (2000 a 08/2026) enquanto o SD2 e de
    07/2026 — devolucao so entra no calculo na fase 2, por competencia da venda
    original (Regra 6).
    """
    assert escalar("SELECT count(*) FROM stg_sd1 WHERE tipo_docto = 'D'") == 69_540
    assert escalar("SELECT sum(receita_bruta) FROM mv_margem_item") == escalar(
        "SELECT sum(vlr_total) FROM stg_sd2"
    )
