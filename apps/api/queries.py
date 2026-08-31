"""Consultas analiticas — SQL puro sobre as materialized views.

Nenhuma agregacao passa pelo ORM: o BI le exatamente o que as views calculam.

Todas as leituras de KPI excluem `sem_custo` e `outlier_custo`. Essas linhas nao
somem do sistema: continuam gravadas e somando na receita total, so ficam fora
do indicador de margem. A API nao reporta mais quantas sao — para auditar, veja
as flags direto em `mv_margem_item`.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import connection

from apps.core.models import ARMAZEM_SEM_CODIGO, GRUPO_SEM_CLASSIFICACAO

# Linhas aptas a compor indicador. Fora daqui: sem custo confiavel (margem
# indeterminada), outlier de custo (erro de cadastro, ver Regra 2) e tipos de saida
# que o negocio marcou como nao-venda em `MapaTES` (remessa, bonificacao).
#
# `tes_receita` e TRUE por padrao para todo TES sem cadastro, entao a condicao nao
# muda numero nenhum ate alguem desmarcar um codigo no Admin — ela existe para que
# esse dia nao exija mexer no codigo. As agregadas ja aplicam o mesmo corte.
LIMPAS = "NOT sem_custo AND NOT outlier_custo AND tes_receita"


def _linhas(sql: str, params: list) -> list[dict[str, Any]]:
    with connection.cursor() as cur:
        cur.execute(sql, params)
        colunas = [c[0] for c in cur.description]
        return [dict(zip(colunas, linha, strict=True)) for linha in cur.fetchall()]


def _um(sql: str, params: list) -> dict[str, Any]:
    resultado = _linhas(sql, params)
    return resultado[0] if resultado else {}


def _valores(coluna: str, view: str, clausula) -> list:
    """Lista simples de valores distintos de uma coluna."""
    return [
        linha[coluna]
        for linha in _linhas(
            f"SELECT DISTINCT {coluna} FROM {view} {clausula.where()} ORDER BY 1",
            clausula.parametros,
        )
    ]


def _dimensao(coluna: str, rotulo: str, view: str, clausula, sentinela: str) -> list[dict]:
    """Opcoes de uma dimensao com codigo e rotulo de negocio.

    O COALESCE no codigo devolve a sentinela para a linha vazia; e o mesmo valor
    que `filtros.DIMENSOES` reconhece de volta e traduz em `IS NULL`.
    """
    return _linhas(
        f"""
        SELECT COALESCE({coluna}, '{sentinela}') AS codigo,
               max({rotulo}) AS rotulo
        FROM {view} {clausula.where()}
        GROUP BY 1 ORDER BY 1
        """,
        clausula.parametros,
    )


def _grupos(view: str, clausula) -> list[dict]:
    """Opcoes de grupo: o que tem movimento no recorte **mais** o cadastro.

    As demais dimensoes listam so o que existe no fato. Grupo nao: o cadastro de
    `MapaGrupo` e a classificacao que o negocio mantem a mao, e um grupo recem
    nomeado que ainda nao apareceu no export sumiria da tela justamente no
    momento em que se quer conferir se ele foi classificado.

    `sem_movimento` diz qual e qual — a tela apaga esses, para ninguem marcar um
    grupo e concluir que o BI zerou. Grupo consolidado (`agrupa_em`) nunca entra:
    o codigo publicado e o do grupo final, e filtrar pelo consolidado nao casa
    nada.
    """
    return _linhas(
        f"""
        WITH com_movimento AS (
            SELECT COALESCE(grupo_codigo, '{GRUPO_SEM_CLASSIFICACAO}') AS codigo,
                   max(grupo_rotulo) AS rotulo
            FROM {view} {clausula.where()}
            GROUP BY 1
        )
        SELECT codigo, rotulo, FALSE AS sem_movimento FROM com_movimento
        UNION ALL
        SELECT g.codigo, g.rotulo, TRUE
        FROM core_mapagrupo g
        WHERE g.ativo
          AND g.agrupa_em_id IS NULL
          AND g.codigo NOT IN (SELECT codigo FROM com_movimento)
        ORDER BY 1
        """,
        clausula.parametros,
    )


def _vendedores(view: str, clausula) -> list[dict]:
    return _linhas(
        f"""
        SELECT DISTINCT vendedor_codigo AS codigo, vendedor_nome AS nome
        FROM {view} {clausula.where('vendedor_codigo IS NOT NULL')}
        ORDER BY 2
        """,
        clausula.parametros,
    )


def _pct(margem, receita) -> Decimal | None:
    if not receita:
        return None
    return round(Decimal(margem) / Decimal(receita), 6)


def kpis(clausula) -> dict[str, Any]:
    """Indicadores consolidados sobre as linhas aptas (ver LIMPAS)."""
    where = clausula.where(LIMPAS)
    principal = _um(
        f"""
        SELECT count(*)                    AS linhas,
               count(DISTINCT num_pedido)  AS pedidos,
               count(DISTINCT sku)         AS skus,
               sum(quantidade)             AS quantidade,
               sum(receita_bruta)          AS receita,
               sum(receita_liquida)        AS receita_liquida,
               sum(desconto)               AS desconto,
               sum(custo_total)            AS custo,
               sum(margem_bruta)           AS margem,
               sum(margem_liquida)         AS margem_liquida
        FROM mv_margem_item
        {where}
        """,
        clausula.parametros,
    )

    receita = principal.get("receita") or Decimal(0)
    receita_liquida = principal.get("receita_liquida") or Decimal(0)
    margem = principal.get("margem") or Decimal(0)
    margem_liquida = principal.get("margem_liquida") or Decimal(0)
    pedidos = principal.get("pedidos") or 0

    # Bruta e liquida convivem: o Protheus registra o desconto a parte, e o negocio
    # precisa ver o faturamento cheio e o efetivamente cobrado sem trocar de tela.
    return {
        "receita_bruta": receita,
        "desconto_total": principal.get("desconto") or Decimal(0),
        "receita_liquida": receita_liquida,
        "custo_total": principal.get("custo") or Decimal(0),
        "margem_bruta": margem,
        "margem_pct": _pct(margem, receita),
        "margem_liquida": margem_liquida,
        "margem_liquida_pct": _pct(margem_liquida, receita_liquida),
        "ticket_medio": (
            (receita / pedidos).quantize(Decimal("0.01")) if pedidos else None
        ),
        "pedidos": pedidos,
        "skus": principal.get("skus") or 0,
        "linhas": principal.get("linhas") or 0,
        "quantidade": principal.get("quantidade") or Decimal(0),
    }


def serie(clausula, granularidade: str) -> list[dict[str, Any]]:
    """Evolucao temporal por canal. `granularidade` ja vem validada pela view."""
    coluna = {"dia": "emissao", "mes": "competencia"}[granularidade]
    return _linhas(
        f"""
        SELECT {coluna} AS periodo,
               canal,
               sum(receita)          AS receita,
               sum(receita_liquida)  AS receita_liquida,
               sum(desconto)         AS desconto,
               sum(custo)            AS custo,
               sum(margem)           AS margem,
               sum(margem_liquida)   AS margem_liquida,
               CASE WHEN sum(receita) <> 0
                    THEN round(sum(margem) / sum(receita), 6) END AS margem_pct,
               -- ::bigint porque sum(bigint) volta numeric no Postgres, e o
               -- renderer serializa Decimal como texto: o SPA espera number aqui.
               sum(pedidos)::bigint  AS pedidos
        FROM mv_margem_diaria
        {clausula.where()}
        GROUP BY 1, 2
        ORDER BY 1, 2
        """,
        clausula.parametros,
    )


def por_vendedor(clausula, ordem: str) -> list[dict[str, Any]]:
    """Ranking de rentabilidade.

    Le `mv_margem_vendedor`, que ja exclui o canal Marketplace: o codigo 72 e o
    integrador Lexos, nao uma pessoa, e nao faz sentido em ranking de vendedor.
    """
    return _linhas(
        f"""
        SELECT vendedor_codigo,
               vendedor_nome,
               canal,
               sum(receita)          AS receita,
               sum(receita_liquida)  AS receita_liquida,
               sum(desconto)         AS desconto,
               sum(custo)            AS custo,
               sum(margem)           AS margem,
               sum(margem_liquida)   AS margem_liquida,
               CASE WHEN sum(receita) <> 0
                    THEN round(sum(margem) / sum(receita), 6) END AS margem_pct,
               sum(pedidos)::bigint  AS pedidos,
               sum(linhas)::bigint   AS linhas
        FROM mv_margem_vendedor
        {clausula.where()}
        GROUP BY 1, 2, 3
        ORDER BY {ordem}
        """,
        clausula.parametros,
    )


def por_armazem(clausula, ordem: str) -> list[dict[str, Any]]:
    """Leitura principal do BI: armazem por fora, grupo por dentro.

    O mesmo grupo aparece em varios armazens, entao grupo sozinho nao organiza a
    analise. Le `mv_margem_diaria`, que ja tem as duas dimensoes e ja aplica o
    corte de linhas aptas. Devolve linhas planas (um par armazem x grupo por
    linha) — aninhar e trabalho da tela, e assim o mesmo payload serve tabela e
    grafico empilhado.
    """
    return _linhas(
        f"""
        SELECT armazem,
               max(armazem_rotulo)   AS armazem_rotulo,
               grupo_codigo,
               max(grupo_rotulo)     AS grupo_rotulo,
               sum(receita)          AS receita,
               sum(receita_liquida)  AS receita_liquida,
               sum(desconto)         AS desconto,
               sum(custo)            AS custo,
               sum(margem)           AS margem,
               sum(margem_liquida)   AS margem_liquida,
               CASE WHEN sum(receita) <> 0
                    THEN round(sum(margem) / sum(receita), 6) END AS margem_pct,
               sum(pedidos)::bigint  AS pedidos,
               sum(linhas)::bigint   AS linhas,
               sum(quantidade)       AS quantidade
        FROM mv_margem_diaria
        {clausula.where()}
        GROUP BY armazem, grupo_codigo
        ORDER BY {ordem}
        """,
        clausula.parametros,
    )


def por_sku(clausula, ordem: str, limite: int, offset: int) -> dict[str, Any]:
    where = clausula.where()
    total = _um(
        f"SELECT count(*) AS total FROM (SELECT sku FROM mv_margem_sku {where} "
        f"GROUP BY sku) t",
        clausula.parametros,
    )
    itens = _linhas(
        f"""
        SELECT sku,
               max(descricao)  AS descricao,
               max(grupo_rotulo) AS grupo,
               sum(quantidade) AS quantidade,
               sum(receita)    AS receita,
               sum(receita_liquida) AS receita_liquida,
               sum(desconto)   AS desconto,
               sum(custo)      AS custo,
               sum(margem)     AS margem,
               sum(margem_liquida) AS margem_liquida,
               CASE WHEN sum(receita) <> 0
                    THEN round(sum(margem) / sum(receita), 6) END AS margem_pct
        FROM mv_margem_sku
        {where}
        GROUP BY sku
        ORDER BY {ordem}
        LIMIT %s OFFSET %s
        """,
        [*clausula.parametros, limite, offset],
    )
    return {"total": total.get("total", 0), "itens": itens}


# --------------------------------------------------------------------------- #
# Carteira de pedidos em aberto (SC6)
# --------------------------------------------------------------------------- #
#
# `mv_carteira_aberta` nao tem `outlier_custo` nem `tes_receita`: outlier e uma
# regra do faturamento, e TES so existe depois da nota. O unico corte de qualidade
# aqui e `sem_custo` — e ele nao esconde a linha, so fica de fora do percentual de
# margem, que sem custo seria indeterminado. O valor em aberto continua somando.


def carteira_resumo(clausula) -> dict[str, Any]:
    """Totais da carteira filtrada.

    Calculado sobre o conjunto inteiro, nao sobre a pagina: um resumo que muda ao
    virar a pagina nao e resumo.
    """
    linha = _um(
        f"""
        SELECT count(*)                        AS itens,
               count(DISTINCT num_pedido)      AS pedidos,
               count(DISTINCT sku)             AS skus,
               sum(qtd_aberta)                 AS quantidade,
               sum(vlr_aberto)                 AS valor_aberto,
               sum(custo_aberto)               AS custo_previsto,
               sum(margem_prevista)            AS margem_prevista,
               -- Base do percentual: so o que tem custo conhecido. Dividir a
               -- margem parcial pela receita cheia subestimaria a margem.
               sum(vlr_aberto) FILTER (WHERE NOT sem_custo) AS base_margem,
               count(*)        FILTER (WHERE atrasado)      AS itens_atrasados,
               sum(vlr_aberto) FILTER (WHERE atrasado)      AS valor_atrasado,
               count(*)        FILTER (WHERE sem_custo)     AS itens_sem_custo,
               count(*)        FILTER (WHERE vendedor_codigo IS NULL
                                        AND canal = '(pedido sem cadastro)')
                                                            AS itens_sem_cadastro,
               max(dt_carga)                   AS dt_foto,
               min(dt_entrega)                 AS entrega_min,
               max(dt_entrega)                 AS entrega_max
        FROM mv_carteira_aberta
        {clausula.where()}
        """,
        clausula.parametros,
    )

    margem = linha.get("margem_prevista") or Decimal(0)
    base = linha.get("base_margem") or Decimal(0)
    pedidos = linha.get("pedidos") or 0
    valor = linha.get("valor_aberto") or Decimal(0)

    return {
        "itens": linha.get("itens") or 0,
        "pedidos": pedidos,
        "skus": linha.get("skus") or 0,
        "quantidade": linha.get("quantidade") or Decimal(0),
        "valor_aberto": valor,
        "custo_previsto": linha.get("custo_previsto") or Decimal(0),
        "margem_prevista": margem,
        "margem_prevista_pct": _pct(margem, base),
        "valor_medio_pedido": (
            (valor / pedidos).quantize(Decimal("0.01")) if pedidos else None
        ),
        "itens_atrasados": linha.get("itens_atrasados") or 0,
        "valor_atrasado": linha.get("valor_atrasado") or Decimal(0),
        "itens_sem_custo": linha.get("itens_sem_custo") or 0,
        "itens_sem_cadastro": linha.get("itens_sem_cadastro") or 0,
        "dt_foto": linha.get("dt_foto"),
        "entrega_min": linha.get("entrega_min"),
        "entrega_max": linha.get("entrega_max"),
    }


def carteira(clausula, ordem: str, limite: int, offset: int) -> dict[str, Any]:
    """Itens em aberto, um por linha de pedido."""
    where = clausula.where()
    total = _um(
        f"SELECT count(*) AS total FROM mv_carteira_aberta {where}", clausula.parametros
    )
    itens = _linhas(
        f"""
        SELECT id,
               num_pedido,
               sku,
               descricao,
               grupo_rotulo    AS grupo,
               armazem,
               armazem_rotulo,
               canal,
               vendedor_codigo,
               vendedor_nome,
               cod_cliente,
               nome_cliente,
               dt_emissao,
               dt_entrega,
               dias_em_aberto,
               atrasado,
               qtd_pedida,
               qtd_entregue,
               qtd_aberta,
               vlr_unitario,
               vlr_aberto,
               custo_aberto,
               margem_prevista,
               margem_prevista_pct,
               sem_custo
        FROM mv_carteira_aberta
        {where}
        ORDER BY {ordem}
        LIMIT %s OFFSET %s
        """,
        [*clausula.parametros, limite, offset],
    )
    return {"total": total.get("total", 0), "itens": itens}


def carteira_opcoes(faceta) -> dict[str, Any]:
    """Filtros da carteira.

    Lista propria porque os valores diferem dos da margem: a carteira tem pedidos
    fora da janela do SD2, e oferecer um vendedor que nao tem item em aberto so
    produz tela vazia. A cascata e a mesma de `opcoes`.
    """
    return {
        "canais": _valores("canal", "mv_carteira_aberta", faceta("canal")),
        "armazens": _dimensao(
            "armazem", "armazem_rotulo", "mv_carteira_aberta", faceta("armazem"),
            ARMAZEM_SEM_CODIGO,
        ),
        "grupos": _grupos("mv_carteira_aberta", faceta("grupo")),
        "vendedores": _vendedores("mv_carteira_aberta", faceta("vendedor")),
    }


def opcoes(faceta) -> dict[str, Any]:
    """Valores disponiveis para os filtros, ja restritos ao escopo do usuario.

    Um vendedor nao pode sequer enxergar a lista de colegas na caixa de filtro.

    `faceta` vem de `filtros.facetas`: cada lista e recortada pelos demais
    filtros, mas nao pelo seu proprio. E o que faz a hierarquia armazem > grupo
    funcionar na tela — escolher o armazem 11 deixa so os grupos que existem
    nele — sem prender o usuario na primeira escolha.
    """
    return {
        "canais": _valores("canal", "mv_margem_item", faceta("canal")),
        "armazens": _dimensao(
            "armazem", "armazem_rotulo", "mv_margem_item", faceta("armazem"),
            ARMAZEM_SEM_CODIGO,
        ),
        "grupos": _grupos("mv_margem_item", faceta("grupo")),
        "vendedores": _vendedores("mv_margem_item", faceta("vendedor")),
        "tes": _linhas(
            f"""
            SELECT tes AS codigo, bool_and(tes_receita) AS conta_como_venda
            FROM mv_margem_item {faceta(None).where('tes IS NOT NULL')}
            GROUP BY 1 ORDER BY 1
            """,
            faceta(None).parametros,
        ),
        "competencias": _valores(
            "competencia", "mv_margem_item", faceta("competencia")
        ),
    }


# --------------------------------------------------------------------------- #
# Pedidos faturados (SD2) — o drill-down de armazem > pedido > item
# --------------------------------------------------------------------------- #
#
# E a unica leitura do BI que sai do agregado e chega no documento: quem ve uma
# margem estranha num armazem precisa responder "qual pedido causou isso?" sem ir
# ao Protheus. Le `mv_margem_item` direto porque as agregadas guardam apenas
# `count(DISTINCT num_pedido)` — numero, nao identidade.
#
# `LIMPAS` **nao** entra no WHERE daqui, ao contrario dos KPIs: a lista e de
# faturamento, e linha sem custo ou com outlier continua sendo receita. O corte de
# qualidade aparece como contagem (`itens_fora_do_kpi`) e como flag no item, para
# que o total do pedido bata com a nota fiscal.

# Venda de balcao nao tem pedido: `num_pedido` e NULL e `numero_pdv` identifica o
# terminal ('2'), nao a venda. O documento dela e a **nota fiscal** — as 555 linhas
# de balcao saem em 350 notas, e e esse o numero de vendas que de fato aconteceu.
# A serie entra na chave porque o numero sozinho nao e unico ('1' na venda com
# pedido, '2' no balcao). A tela rotula como Balcao/PDV para ninguem ler a chave
# como um pedido do Protheus.
CHAVE_PEDIDO = "COALESCE(num_pedido, 'NF-' || serie_nf || '-' || nota_fiscal)"
PREFIXO_NOTA = "NF-"


def _condicao_chave(chave: str) -> tuple[str, list]:
    """Traduz a chave publicada de volta para as colunas de origem."""
    if chave.startswith(PREFIXO_NOTA):
        serie, _, numero = chave[len(PREFIXO_NOTA) :].partition("-")
        return (
            "(num_pedido IS NULL AND serie_nf = %s AND nota_fiscal = %s)",
            [serie, numero],
        )
    return "num_pedido = %s", [chave]


def pedidos(clausula, ordem: str, limite: int, offset: int) -> dict[str, Any]:
    """Uma linha por pedido faturado, dentro do recorte da clausula."""
    where = clausula.where()
    total = _um(
        f"SELECT count(*) AS total FROM (SELECT {CHAVE_PEDIDO} AS chave "
        f"FROM mv_margem_item {where} GROUP BY 1) t",
        clausula.parametros,
    )
    linhas = _linhas(
        f"""
        SELECT {CHAVE_PEDIDO}                       AS chave,
               CASE WHEN min(num_pedido) IS NULL THEN 'pdv' ELSE 'pedido' END
                                                    AS origem,
               min(emissao)                         AS emissao,
               min(competencia)                     AS competencia,
               -- Cliente, canal e vendedor sao constantes dentro do pedido (vem
               -- do SC5); o min() so escolhe um valor de um conjunto de iguais.
               min(cod_cliente)                     AS cod_cliente,
               min(nome_cliente)                    AS nome_cliente,
               min(canal)                           AS canal,
               min(vendedor_codigo)                 AS vendedor_codigo,
               min(vendedor_nome)                   AS vendedor_nome,
               min(armazem)                         AS armazem,
               min(armazem_rotulo)                  AS armazem_rotulo,
               -- Nota fiscal: pedido e nota nao andam colados — 256 pedidos do
               -- baseline saem em mais de uma nota. A tela mostra o numero quando
               -- so ha uma e a contagem quando ha varias; escolher uma delas para
               -- representar o pedido mentiria sobre qual documento faturou o que.
               min(nota_fiscal)                     AS nota_fiscal,
               min(serie_nf)                        AS serie_nf,
               count(DISTINCT (nota_fiscal, serie_nf)) AS notas,
               -- Um pedido pode sair por mais de um armazem: a tela precisa
               -- avisar em vez de rotular o pedido inteiro pelo primeiro.
               count(DISTINCT armazem)              AS armazens,
               count(*)                             AS itens,
               sum(quantidade)                      AS quantidade,
               sum(receita_bruta)                   AS receita,
               sum(desconto)                        AS desconto,
               sum(receita_liquida)                 AS receita_liquida,
               sum(custo_total)                     AS custo,
               sum(margem_bruta)                    AS margem,
               sum(margem_liquida)                  AS margem_liquida,
               CASE WHEN sum(receita_bruta) <> 0
                    THEN round(sum(margem_bruta) / sum(receita_bruta), 6) END
                                                    AS margem_pct,
               count(*) FILTER (WHERE NOT ({LIMPAS})) AS itens_fora_do_kpi
        FROM mv_margem_item
        {where}
        GROUP BY 1
        ORDER BY {ordem}
        LIMIT %s OFFSET %s
        """,
        [*clausula.parametros, limite, offset],
    )
    return {
        "total": total.get("total", 0),
        "pedidos": linhas,
        "resumo": pedidos_resumo(clausula),
    }


def pedidos_resumo(clausula) -> dict[str, Any]:
    """Totais do conjunto filtrado inteiro — nao da pagina.

    Mesma regra de `carteira_resumo`: um resumo que muda ao virar a pagina nao e
    resumo.
    """
    linha = _um(
        f"""
        SELECT count(DISTINCT {CHAVE_PEDIDO})       AS pedidos,
               count(DISTINCT (nota_fiscal, serie_nf)) AS notas,
               count(*)                             AS itens,
               count(DISTINCT sku)                  AS skus,
               sum(receita_bruta)                   AS receita,
               sum(desconto)                        AS desconto,
               sum(receita_liquida)                 AS receita_liquida,
               sum(custo_total)                     AS custo,
               -- Base do percentual: so o que entra no KPI. Dividir a margem
               -- parcial pela receita cheia subestimaria a margem.
               sum(margem_bruta) FILTER (WHERE {LIMPAS})  AS margem,
               sum(receita_bruta) FILTER (WHERE {LIMPAS}) AS base_margem,
               count(*) FILTER (WHERE NOT ({LIMPAS}))     AS itens_fora_do_kpi
        FROM mv_margem_item
        {clausula.where()}
        """,
        clausula.parametros,
    )

    margem = linha.get("margem") or Decimal(0)
    receita = linha.get("receita") or Decimal(0)
    # Receita dentro do indicador: e ela — nao a faturada — que reconcilia com a
    # tela `Por armazem`, porque as agregadas ja nascem cortadas por LIMPAS. Sem
    # expor as duas, o usuario que clica no olho ve um total maior e acha que uma
    # das telas esta errada.
    receita_no_kpi = linha.get("base_margem") or Decimal(0)
    quantidade_pedidos = linha.get("pedidos") or 0

    return {
        "pedidos": quantidade_pedidos,
        "notas": linha.get("notas") or 0,
        "itens": linha.get("itens") or 0,
        "skus": linha.get("skus") or 0,
        "receita": receita,
        "desconto": linha.get("desconto") or Decimal(0),
        "receita_liquida": linha.get("receita_liquida") or Decimal(0),
        "custo": linha.get("custo") or Decimal(0),
        "margem": margem,
        "receita_no_kpi": receita_no_kpi,
        "margem_pct": _pct(margem, receita_no_kpi),
        "ticket_medio": (
            (receita / quantidade_pedidos).quantize(Decimal("0.01"))
            if quantidade_pedidos
            else None
        ),
        "itens_fora_do_kpi": linha.get("itens_fora_do_kpi") or 0,
    }


def pedido(clausula, escopo_puro, chave: str) -> dict[str, Any] | None:
    """Cabecalho, totais e itens de um pedido. `None` quando nada casa.

    O escopo do usuario vem dentro da clausula, entao um vendedor que adivinhe o
    numero de um pedido de colega cai no `None` — e a view responde 404, nunca o
    conteudo.

    `escopo_puro` e a mesma clausula **sem** os filtros de tela: e o que permite
    dizer quantas linhas do pedido ficaram de fora do recorte atual, em vez de
    deixar o total do detalhe divergir da lista sem explicacao.
    """
    condicao, valores = _condicao_chave(chave)
    itens = _linhas(
        f"""
        SELECT id,
               num_pedido,
               numero_pdv,
               emissao,
               competencia,
               cod_cliente,
               nome_cliente,
               canal,
               vendedor_codigo,
               vendedor_nome,
               nota_fiscal,
               serie_nf,
               sku,
               descricao,
               grupo_codigo,
               grupo_rotulo,
               grupo_reclassificado,
               armazem,
               armazem_rotulo,
               tes,
               tes_receita,
               quantidade,
               vlr_unitario,
               receita_bruta,
               desconto,
               receita_liquida,
               custo_unitario_ref,
               origem_custo,
               custo_total,
               margem_bruta,
               margem_liquida,
               margem_pct,
               sem_custo,
               outlier_custo
        FROM mv_margem_item
        {clausula.where(condicao)}
        ORDER BY sku
        """,
        [*clausula.parametros, *valores],
    )
    if not itens:
        return None

    def soma(campo: str) -> Decimal:
        return sum((i[campo] or Decimal(0) for i in itens), Decimal(0))

    # Linhas aptas a compor percentual (ver LIMPAS). Uma linha sem custo tem margem
    # NULL: somada como zero ela fingiria prejuizo, entao ela fica fora da base.
    aptas = [
        i
        for i in itens
        if not i["sem_custo"] and not i["outlier_custo"] and i["tes_receita"]
    ]

    def soma_apta(campo: str) -> Decimal:
        return sum((i[campo] or Decimal(0) for i in aptas), Decimal(0))

    total_no_escopo = _um(
        f"SELECT count(*) AS total FROM mv_margem_item "
        f"{escopo_puro.where(condicao)}",
        [*escopo_puro.parametros, *valores],
    ).get("total", 0)

    primeiro = itens[0]
    return {
        "pedido": {
            "chave": chave,
            "origem": "pdv" if chave.startswith(PREFIXO_NOTA) else "pedido",
            "num_pedido": primeiro["num_pedido"],
            "numero_pdv": primeiro["numero_pdv"],
            "emissao": min(i["emissao"] for i in itens),
            "competencia": min(i["competencia"] for i in itens),
            "cod_cliente": primeiro["cod_cliente"],
            "nome_cliente": primeiro["nome_cliente"],
            "canal": primeiro["canal"],
            "vendedor_codigo": primeiro["vendedor_codigo"],
            "vendedor_nome": primeiro["vendedor_nome"],
            "armazens": sorted({i["armazem"] for i in itens if i["armazem"]}),
            # Uma linha por nota do pedido, ordenada: e o que responde "esta
            # margem saiu em qual documento?" sem abrir item por item.
            "notas": [
                {"nota_fiscal": numero, "serie_nf": serie}
                for numero, serie in sorted(
                    {(i["nota_fiscal"], i["serie_nf"]) for i in itens}
                )
            ],
            "itens": len(itens),
            "quantidade": soma("quantidade"),
            "receita": soma("receita_bruta"),
            "desconto": soma("desconto"),
            "receita_liquida": soma("receita_liquida"),
            "custo": soma("custo_total"),
            "margem": soma("margem_bruta"),
            "margem_pct": _pct(soma_apta("margem_bruta"), soma_apta("receita_bruta")),
            "margem_liquida": soma("margem_liquida"),
            "margem_liquida_pct": _pct(
                soma_apta("margem_liquida"), soma_apta("receita_liquida")
            ),
            "itens_fora_do_kpi": len(itens) - len(aptas),
            # Um pedido pode ter itens em outro armazem ou outra competencia.
            "linhas_fora_do_recorte": max(total_no_escopo - len(itens), 0),
        },
        "itens": itens,
    }
