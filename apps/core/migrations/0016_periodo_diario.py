"""Dia nas agregadas de vendedor e SKU.

O filtro de periodo do BI deixou de ser competencia mensal e passou a ser um
intervalo de datas qualquer (`data_inicio`/`data_fim` recortando `emissao`).
`mv_margem_diaria` ja guardava `emissao` e `competencia` na mesma linha, mas
`mv_margem_vendedor` e `mv_margem_sku` so tinham a competencia — um recorte de
15/07 a 20/08 nao tinha como ser respeitado nessas duas telas, que responderiam
pelos meses inteiros enquanto os KPIs respondiam pelos dias.

`mv_margem_item`, `mv_margem_diaria` e `mv_carteira_aberta` nao mudam. O indice
de `emissao` em `mv_margem_item` entra junto: todos os indices de la punham
`competencia` em segundo lugar, e agora o recorte comum do BI e a emissao.
"""

from django.db import migrations

VIEWS = r"""
DROP MATERIALIZED VIEW IF EXISTS mv_margem_sku;
DROP MATERIALIZED VIEW IF EXISTS mv_margem_vendedor;

CREATE INDEX IF NOT EXISTS idx_mvi_emissao ON mv_margem_item (emissao);

-- O armazem entra aqui porque o filtro de armazem e montado igual para TODOS os
-- endpoints (apps/api/filtros.py): sem a coluna, /margem/vendedor?armazem=02
-- estourava 'column "armazem" does not exist' com o usuario apenas clicando no
-- select da tela Por vendedor.
CREATE MATERIALIZED VIEW mv_margem_vendedor AS
SELECT
    emissao,
    competencia,
    vendedor_codigo,
    vendedor_nome,
    canal,
    armazem,
    armazem_rotulo,
    count(*)                     AS linhas,
    count(DISTINCT num_pedido)   AS pedidos,
    sum(receita_bruta)           AS receita,
    sum(receita_liquida)         AS receita_liquida,
    sum(desconto)                AS desconto,
    sum(custo_total)             AS custo,
    sum(margem_bruta)            AS margem,
    sum(margem_liquida)          AS margem_liquida
FROM mv_margem_item
WHERE NOT sem_custo AND NOT outlier_custo AND tes_receita
  AND vendedor_codigo IS NOT NULL   -- Marketplace nao entra em ranking de pessoa
GROUP BY 1, 2, 3, 4, 5, 6, 7;

CREATE UNIQUE INDEX uq_mv_margem_vendedor
    ON mv_margem_vendedor (emissao, vendedor_codigo, canal, armazem)
    NULLS NOT DISTINCT;
-- A competencia deixou de ser a primeira coluna do indice unico: sem este, o
-- recorte por mes (granularidade 'mes' da serie) perderia o suporte de indice.
CREATE INDEX idx_mvv_competencia ON mv_margem_vendedor (competencia);

CREATE MATERIALIZED VIEW mv_margem_sku AS
SELECT
    emissao,
    competencia,
    sku,
    max(descricao)               AS descricao,
    COALESCE(grupo_codigo, 'Sem grupo') AS grupo_codigo,
    grupo_rotulo,
    canal,
    armazem,
    armazem_rotulo,
    vendedor_codigo,
    count(*)                     AS linhas,
    sum(quantidade)              AS quantidade,
    sum(receita_bruta)           AS receita,
    sum(receita_liquida)         AS receita_liquida,
    sum(desconto)                AS desconto,
    sum(custo_total)             AS custo,
    sum(margem_bruta)            AS margem,
    sum(margem_liquida)          AS margem_liquida
FROM mv_margem_item
WHERE NOT sem_custo AND NOT outlier_custo AND tes_receita
GROUP BY 1, 2, 3, 5, 6, 7, 8, 9, 10;

CREATE UNIQUE INDEX uq_mv_margem_sku ON mv_margem_sku
    (emissao, sku, grupo_codigo, canal, armazem, vendedor_codigo)
    NULLS NOT DISTINCT;
CREATE INDEX idx_mvs_vendedor ON mv_margem_sku (vendedor_codigo);
CREATE INDEX idx_mvs_competencia ON mv_margem_sku (competencia);
"""

REVERTE_VIEWS = r"""
DROP MATERIALIZED VIEW IF EXISTS mv_margem_sku;
DROP MATERIALIZED VIEW IF EXISTS mv_margem_vendedor;

DROP INDEX IF EXISTS idx_mvi_emissao;

CREATE MATERIALIZED VIEW mv_margem_vendedor AS
SELECT
    competencia,
    vendedor_codigo,
    vendedor_nome,
    canal,
    armazem,
    armazem_rotulo,
    count(*)                     AS linhas,
    count(DISTINCT num_pedido)   AS pedidos,
    sum(receita_bruta)           AS receita,
    sum(receita_liquida)         AS receita_liquida,
    sum(desconto)                AS desconto,
    sum(custo_total)             AS custo,
    sum(margem_bruta)            AS margem,
    sum(margem_liquida)          AS margem_liquida
FROM mv_margem_item
WHERE NOT sem_custo AND NOT outlier_custo AND tes_receita
  AND vendedor_codigo IS NOT NULL
GROUP BY 1, 2, 3, 4, 5, 6;

CREATE UNIQUE INDEX uq_mv_margem_vendedor
    ON mv_margem_vendedor (competencia, vendedor_codigo, canal, armazem)
    NULLS NOT DISTINCT;

CREATE MATERIALIZED VIEW mv_margem_sku AS
SELECT
    competencia,
    sku,
    max(descricao)               AS descricao,
    COALESCE(grupo_codigo, 'Sem grupo') AS grupo_codigo,
    grupo_rotulo,
    canal,
    armazem,
    armazem_rotulo,
    vendedor_codigo,
    count(*)                     AS linhas,
    sum(quantidade)              AS quantidade,
    sum(receita_bruta)           AS receita,
    sum(receita_liquida)         AS receita_liquida,
    sum(desconto)                AS desconto,
    sum(custo_total)             AS custo,
    sum(margem_bruta)            AS margem,
    sum(margem_liquida)          AS margem_liquida
FROM mv_margem_item
WHERE NOT sem_custo AND NOT outlier_custo AND tes_receita
GROUP BY 1, 2, 4, 5, 6, 7, 8, 9;

CREATE UNIQUE INDEX uq_mv_margem_sku ON mv_margem_sku
    (competencia, sku, grupo_codigo, canal, armazem, vendedor_codigo)
    NULLS NOT DISTINCT;
CREATE INDEX idx_mvs_vendedor ON mv_margem_sku (vendedor_codigo);
"""


def atualizar_views():
    # Import tardio: migration nao deve carregar codigo de app na importacao do
    # modulo, so quando a operacao realmente roda.
    from apps.etl import writers

    # Recriar a view a deixa vazia: sem o refresh o deploy sobe com a tela em
    # branco ate alguem rodar `refresh_views` na mao.
    writers.refresh_views(concorrente=False)


def refrescar(apps, schema_editor):
    atualizar_views()


class Migration(migrations.Migration):
    dependencies = [("core", "0015_nota_fiscal")]

    operations = [
        migrations.RunSQL(VIEWS, REVERTE_VIEWS),
        migrations.RunPython(refrescar, refrescar),
    ]
