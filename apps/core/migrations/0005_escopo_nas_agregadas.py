"""Leva `vendedor_codigo` para as agregadas.

Invariante do modelo: **toda materialized view legivel pela API precisa carregar a
coluna de escopo**. Sem ela o filtro do perfil `vendedor` nao e aplicavel, e o
endpoint ou quebra (bom) ou devolve dado de terceiro (ruim). Um teste de isolamento
pegou a ausencia em `mv_margem_diaria`.

O indice unico usa NULLS NOT DISTINCT porque `vendedor_codigo` e nulo em todo o
canal Marketplace, e o REFRESH CONCURRENTLY exige um indice que identifique a linha.
"""

from django.db import migrations

RECRIA = r"""
DROP MATERIALIZED VIEW IF EXISTS mv_margem_diaria;
DROP MATERIALIZED VIEW IF EXISTS mv_margem_sku;

CREATE MATERIALIZED VIEW mv_margem_diaria AS
SELECT
    emissao,
    competencia,
    canal,
    COALESCE(grupo_codigo, '(sem classificacao)') AS grupo_codigo,
    grupo_rotulo,
    armazem,
    vendedor_codigo,
    count(*)                     AS linhas,
    count(DISTINCT num_pedido)   AS pedidos,
    sum(quantidade)              AS quantidade,
    sum(receita_bruta)           AS receita,
    sum(custo_total)             AS custo,
    sum(margem_bruta)            AS margem
FROM mv_margem_item
WHERE NOT sem_custo AND NOT outlier_custo
GROUP BY 1, 2, 3, 4, 5, 6, 7;

CREATE UNIQUE INDEX uq_mv_margem_diaria ON mv_margem_diaria
    (emissao, canal, grupo_codigo, armazem, vendedor_codigo) NULLS NOT DISTINCT;
CREATE INDEX idx_mvd_vendedor ON mv_margem_diaria (vendedor_codigo);
CREATE INDEX idx_mvd_competencia ON mv_margem_diaria (competencia);

CREATE MATERIALIZED VIEW mv_margem_sku AS
SELECT
    competencia,
    sku,
    max(descricao)               AS descricao,
    COALESCE(grupo_codigo, '(sem classificacao)') AS grupo_codigo,
    grupo_rotulo,
    canal,
    armazem,
    vendedor_codigo,
    count(*)                     AS linhas,
    sum(quantidade)              AS quantidade,
    sum(receita_bruta)           AS receita,
    sum(custo_total)             AS custo,
    sum(margem_bruta)            AS margem
FROM mv_margem_item
WHERE NOT sem_custo AND NOT outlier_custo
GROUP BY 1, 2, 4, 5, 6, 7, 8;

CREATE UNIQUE INDEX uq_mv_margem_sku ON mv_margem_sku
    (competencia, sku, grupo_codigo, canal, armazem, vendedor_codigo)
    NULLS NOT DISTINCT;
CREATE INDEX idx_mvs_vendedor ON mv_margem_sku (vendedor_codigo);
"""

REVERTE = r"""
DROP MATERIALIZED VIEW IF EXISTS mv_margem_diaria;
DROP MATERIALIZED VIEW IF EXISTS mv_margem_sku;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0004_dados_iniciais")]
    operations = [migrations.RunSQL(RECRIA, REVERTE)]
