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


def carteira_opcoes(escopo) -> dict[str, Any]:
    """Filtros da carteira.

    Lista propria porque os valores diferem dos da margem: a carteira tem pedidos
    fora da janela do SD2, e oferecer um vendedor que nao tem item em aberto so
    produz tela vazia.
    """
    where = f"WHERE {escopo.condicao}" if escopo.restrito else ""
    p = escopo.parametros
    return {
        "canais": [
            linha["canal"]
            for linha in _linhas(
                f"SELECT DISTINCT canal FROM mv_carteira_aberta {where} ORDER BY 1", p
            )
        ],
        "grupos": _linhas(
            f"""
            SELECT COALESCE(grupo_codigo, '(sem classificacao)') AS codigo,
                   max(grupo_rotulo) AS rotulo
            FROM mv_carteira_aberta {where}
            GROUP BY 1 ORDER BY 1
            """,
            p,
        ),
        "armazens": [
            linha["armazem"]
            for linha in _linhas(
                f"SELECT DISTINCT armazem FROM mv_carteira_aberta {where} ORDER BY 1", p
            )
        ],
        "vendedores": _linhas(
            f"""
            SELECT DISTINCT vendedor_codigo AS codigo, vendedor_nome AS nome
            FROM mv_carteira_aberta
            WHERE vendedor_codigo IS NOT NULL
            {'AND ' + escopo.condicao if escopo.restrito else ''}
            ORDER BY 2
            """,
            p,
        ),
    }


def opcoes(escopo) -> dict[str, Any]:
    """Valores disponiveis para os filtros, ja restritos ao escopo do usuario.

    Um vendedor nao pode sequer enxergar a lista de colegas na caixa de filtro.
    """

    def where(*extras: str) -> str:
        condicoes = ([escopo.condicao] if escopo.restrito else []) + list(extras)
        return f"WHERE {' AND '.join(condicoes)}" if condicoes else ""

    p = escopo.parametros

    return {
        "canais": [
            linha["canal"]
            for linha in _linhas(
                f"SELECT DISTINCT canal FROM mv_margem_item {where()} ORDER BY 1", p
            )
        ],
        "grupos": _linhas(
            f"""
            SELECT COALESCE(grupo_codigo, '(sem classificacao)') AS codigo,
                   max(grupo_rotulo) AS rotulo
            FROM mv_margem_item {where()}
            GROUP BY 1 ORDER BY 1
            """,
            p,
        ),
        "armazens": [
            linha["armazem"]
            for linha in _linhas(
                f"SELECT DISTINCT armazem FROM mv_margem_item {where()} ORDER BY 1", p
            )
        ],
        "vendedores": _linhas(
            f"""
            SELECT DISTINCT vendedor_codigo AS codigo, vendedor_nome AS nome
            FROM mv_margem_item
            {where('vendedor_codigo IS NOT NULL')}
            ORDER BY 2
            """,
            p,
        ),
        "tes": _linhas(
            f"""
            SELECT tes AS codigo, bool_and(tes_receita) AS conta_como_venda
            FROM mv_margem_item {where('tes IS NOT NULL')}
            GROUP BY 1 ORDER BY 1
            """,
            p,
        ),
        "competencias": [
            linha["competencia"]
            for linha in _linhas(
                f"SELECT DISTINCT competencia FROM mv_margem_item {where()} ORDER BY 1",
                p,
            )
        ],
    }
