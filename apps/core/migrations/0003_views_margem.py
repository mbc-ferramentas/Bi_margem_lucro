"""Materialized views de margem bruta.

Toda a agregacao analitica do BI sai daqui. A aplicacao nunca calcula margem em
Python nem pelo ORM — le estas views com SQL puro.

Escopo: **margem bruta**. Nao inclui impostos, frete, comissao de marketplace nem
devolucoes (ver data/stack.md secao 0).
"""

from django.db import migrations

VIEWS = r"""
-- ---------------------------------------------------------------------------
-- mv_margem_item — granularidade de item faturado
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_margem_item AS
WITH parametro AS (
    SELECT COALESCE((SELECT limite FROM core_paramoutlier WHERE id = 1), -1.0) AS limite
),
pedidos AS (
    -- O SC5 traz mais de uma linha por pedido (uma por nota fiscal): 257 pedidos
    -- com 2+ notas em 07/2026. Sem o DISTINCT ON a receita duplicaria no join.
    SELECT DISTINCT ON (numero)
           numero, vendedor, nome_vendedor, cliente, nome_cliente
    FROM stg_sc5
    ORDER BY numero
),
base AS (
    SELECT
        d.id,
        d.filial,
        d.produto                                   AS sku,
        b.descricao,
        d.armazem,
        d.emissao,
        d.competencia,
        d.num_pedido,
        d.numero_pdv,
        d.cliente                                   AS cod_cliente,
        p.nome_cliente,
        d.quantidade,
        d.vlr_unitario,
        d.vlr_total                                 AS receita_bruta,

        -- Grupo: reclassificacao manual tem precedencia sobre o cadastro do Protheus.
        COALESCE(r.grupo_id, NULLIF(b.grupo, ''))   AS grupo_codigo,
        (r.grupo_id IS NOT NULL)                    AS grupo_reclassificado,

        -- Regra 1: canal e vendedor sao dimensoes distintas. O codigo 72 (Lexos) e
        -- o integrador de marketplace, nao uma pessoa — fica fora do ranking de
        -- vendedor. O armazem NAO serve para segmentar canal: 97,9% da receita
        -- esta no armazem 02.
        CASE
            WHEN mc.canal IS NOT NULL     THEN mc.canal
            WHEN d.num_pedido IS NULL     THEN 'Balcao-PDV'
            WHEN p.numero IS NULL         THEN '(pedido sem cadastro)'
            ELSE 'Venda interna'
        END                                         AS canal,
        CASE WHEN mc.canal IS NULL THEN p.vendedor      END AS vendedor_codigo,
        CASE WHEN mc.canal IS NULL THEN p.nome_vendedor END AS vendedor_nome,

        -- Regra 3: cascata de custo.
        COALESCE(
            NULLIF(d.custo_saida,     0),   -- D2_CUSTO1: congelado no faturamento
            NULLIF(b.custo_unitario,  0),   -- C Unitario: custo medio contabil
            NULLIF(b.vlr_ult_compra,  0),   -- V. Ult. Comp
            NULLIF(o.custo_outro_arm, 0)    -- mesmo SKU em outro armazem
        )                                           AS custo_unitario_ref,
        CASE
            WHEN NULLIF(d.custo_saida,     0) IS NOT NULL THEN 'saida'
            WHEN NULLIF(b.custo_unitario,  0) IS NOT NULL THEN 'medio'
            WHEN NULLIF(b.vlr_ult_compra,  0) IS NOT NULL THEN 'ultima_compra'
            WHEN NULLIF(o.custo_outro_arm, 0) IS NOT NULL THEN 'outro_armazem'
        END                                         AS origem_custo
    FROM stg_sd2 d
    -- Snapshot do SB2 correspondente a competencia da venda: e o que mantem a
    -- margem de meses fechados imutavel entre recargas.
    LEFT JOIN vw_snapshot_competencia s
           ON s.competencia = d.competencia
    LEFT JOIN stg_sb2 b
           ON b.filial   = d.filial
          AND b.produto  = d.produto
          AND b.armazem  = d.armazem
          AND b.dt_carga = s.dt_carga
    LEFT JOIN LATERAL (
        SELECT COALESCE(NULLIF(b2.custo_unitario, 0), NULLIF(b2.vlr_ult_compra, 0))
                   AS custo_outro_arm
        FROM stg_sb2 b2
        WHERE b2.filial   = d.filial
          AND b2.produto  = d.produto
          AND b2.armazem <> d.armazem
          AND b2.dt_carga = s.dt_carga
          AND COALESCE(NULLIF(b2.custo_unitario, 0), NULLIF(b2.vlr_ult_compra, 0)) IS NOT NULL
        ORDER BY b2.armazem
        LIMIT 1
    ) o ON TRUE
    LEFT JOIN pedidos p             ON p.numero  = d.num_pedido
    LEFT JOIN core_mapacanal mc     ON mc.codigo_vendedor = p.vendedor
    LEFT JOIN core_reclassificacaosku r ON r.sku = d.produto
)
SELECT
    base.*,
    COALESCE(g.rotulo, '(sem classificacao)')       AS grupo_rotulo,
    quantidade * custo_unitario_ref                 AS custo_total,
    receita_bruta - quantidade * custo_unitario_ref AS margem_bruta,
    CASE WHEN receita_bruta <> 0
         THEN (receita_bruta - quantidade * custo_unitario_ref) / receita_bruta
    END                                             AS margem_pct,

    -- Flags de qualidade. Linhas marcadas saem do KPI consolidado e aparecem na
    -- tela de Qualidade de Dado com o motivo.
    (custo_unitario_ref IS NULL)                    AS sem_custo,
    (
        custo_unitario_ref IS NOT NULL
        AND receita_bruta <> 0
        AND (receita_bruta - quantidade * custo_unitario_ref) / receita_bruta
            < (SELECT limite FROM parametro)
    )                                               AS outlier_custo
FROM base
LEFT JOIN core_mapagrupo g ON g.codigo = base.grupo_codigo;

CREATE UNIQUE INDEX uq_mv_margem_item     ON mv_margem_item (id);
CREATE INDEX idx_mvi_canal      ON mv_margem_item (canal, competencia);
CREATE INDEX idx_mvi_vendedor   ON mv_margem_item (vendedor_codigo, competencia);
CREATE INDEX idx_mvi_grupo      ON mv_margem_item (grupo_codigo, armazem, competencia);
CREATE INDEX idx_mvi_sku        ON mv_margem_item (sku, competencia);
CREATE INDEX idx_mvi_qualidade  ON mv_margem_item (sem_custo, outlier_custo);
CREATE INDEX idx_mvi_descricao  ON mv_margem_item USING gin (descricao gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Agregadas. Somam apenas linhas limpas: sem_custo e outlier ficam de fora do KPI.
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_margem_diaria AS
SELECT
    emissao,
    competencia,
    canal,
    COALESCE(grupo_codigo, '(sem classificacao)') AS grupo_codigo,
    grupo_rotulo,
    armazem,
    count(*)                     AS linhas,
    count(DISTINCT num_pedido)   AS pedidos,
    sum(quantidade)              AS quantidade,
    sum(receita_bruta)           AS receita,
    sum(custo_total)             AS custo,
    sum(margem_bruta)            AS margem
FROM mv_margem_item
WHERE NOT sem_custo AND NOT outlier_custo
GROUP BY 1, 2, 3, 4, 5, 6;

CREATE UNIQUE INDEX uq_mv_margem_diaria
    ON mv_margem_diaria (emissao, canal, grupo_codigo, armazem);

CREATE MATERIALIZED VIEW mv_margem_vendedor AS
SELECT
    competencia,
    vendedor_codigo,
    vendedor_nome,
    canal,
    count(*)                     AS linhas,
    count(DISTINCT num_pedido)   AS pedidos,
    sum(receita_bruta)           AS receita,
    sum(custo_total)             AS custo,
    sum(margem_bruta)            AS margem
FROM mv_margem_item
WHERE NOT sem_custo AND NOT outlier_custo
  AND vendedor_codigo IS NOT NULL   -- Marketplace nao entra em ranking de pessoa
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX uq_mv_margem_vendedor
    ON mv_margem_vendedor (competencia, vendedor_codigo, canal);

CREATE MATERIALIZED VIEW mv_margem_sku AS
SELECT
    competencia,
    sku,
    max(descricao)               AS descricao,
    COALESCE(grupo_codigo, '(sem classificacao)') AS grupo_codigo,
    grupo_rotulo,
    canal,
    armazem,
    count(*)                     AS linhas,
    sum(quantidade)              AS quantidade,
    sum(receita_bruta)           AS receita,
    sum(custo_total)             AS custo,
    sum(margem_bruta)            AS margem
FROM mv_margem_item
WHERE NOT sem_custo AND NOT outlier_custo
GROUP BY 1, 2, 4, 5, 6, 7;

CREATE UNIQUE INDEX uq_mv_margem_sku
    ON mv_margem_sku (competencia, sku, grupo_codigo, canal, armazem);
"""

REVERTE = """
DROP MATERIALIZED VIEW IF EXISTS mv_margem_sku;
DROP MATERIALIZED VIEW IF EXISTS mv_margem_vendedor;
DROP MATERIALIZED VIEW IF EXISTS mv_margem_diaria;
DROP MATERIALIZED VIEW IF EXISTS mv_margem_item;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0002_staging")]
    operations = [migrations.RunSQL(VIEWS, REVERTE)]
