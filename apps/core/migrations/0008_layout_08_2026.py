"""Novo layout do export do Protheus (08/2026).

O que chegou:

- **`Custo` no SD2** — o `D2_CUSTO1` que faltava. E o custo **total da linha**, nao
  unitario (SKU 114 sai 91,02 com quantidade 3 e 182,04 com quantidade 6), entao a
  cascata da Regra 3 divide por quantidade antes de comparar com o SB2. Cobre 98,8%
  das linhas; as 469 com custo zero continuam caindo na cascata antiga.
- **`Grupo` no SD2** — o grupo da propria linha faturada, mais fiel que o cadastro
  atual do SB2. Entra na precedencia logo abaixo da reclassificacao manual.
- **`Tipo Saida` (D2_TES)** — passa a existir, mas nao filtra nada sozinho: a
  classificacao vive em `core_mapates`, e todo codigo nasce contando como venda.
- **`Desconto` no SD2** — R$ 1.186.557 em 07/2026, 12% do faturamento, e **nao**
  esta abatido de `Vlr.Total`. A view passa a expor receita bruta e liquida lado a
  lado em vez de escolher uma.
- **`Sld.Atu.` no SB2**, no lugar de `Saldo Disp.`.
- **SD1** — itens de nota de entrada. Fase 1 nao usa (ver `data/stack.md` secao 0);
  entra no staging para a fase 2 achar o historico pronto.
"""

from django.db import migrations, models

TES_OBSERVADOS = [
    "600", "602", "60M", "610", "612", "620", "622", "625", "628", "629",
    "630", "631", "632", "633", "634", "639", "650", "670", "672", "685",
    "686", "700", "704", "707", "722", "723", "741", "840", "860", "886",
    "894", "901",
]

STAGING = r"""
ALTER TABLE stg_sb2 ADD COLUMN IF NOT EXISTS sld_atu numeric(18,4);

ALTER TABLE stg_sd2 ADD COLUMN IF NOT EXISTS loja      text;
ALTER TABLE stg_sd2 ADD COLUMN IF NOT EXISTS desc_item text;
ALTER TABLE stg_sd2 ADD COLUMN IF NOT EXISTS grupo_doc text;
ALTER TABLE stg_sd2 ADD COLUMN IF NOT EXISTS desconto  numeric(18,4);

CREATE INDEX IF NOT EXISTS idx_sd2_tes ON stg_sd2 (tes);

-- SD1: itens de nota de ENTRADA (compra, devolucao de cliente, complemento).
-- (filial, documento, serie, item_nf) NAO e unica — 183.566 combinacoes para
-- 185.297 linhas, e `serie` vem vazia em parte delas. Por isso nao ha PRIMARY KEY
-- natural e a carga substitui a competencia inteira, como no SD2.
CREATE TABLE IF NOT EXISTS stg_sd1 (
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    filial        text NOT NULL,
    documento     text,
    serie         text,
    item_nf       text,
    produto       text NOT NULL,
    desc_produto  text,
    unidade       text,
    quantidade    numeric(18,4),
    vlr_unitario  numeric(18,4),
    vlr_total     numeric(18,4),
    custo_moeda1  numeric(18,4),
    desconto      numeric(18,4),
    num_pedido    text,
    item_pedido   text,
    forn_cliente  text,
    loja          text,
    armazem       text,
    grupo         text,
    tipo_docto    text,               -- N entrada, D devolucao, C complemento, B benef.
    tes           text,               -- D1_TES
    docto_origem  text,
    serie_origem  text,
    desc_item     text,
    dt_emissao    date,
    dt_digitacao  date,
    competencia   date NOT NULL,
    dt_carga      date NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sd1_competencia ON stg_sd1 (competencia);
CREATE INDEX IF NOT EXISTS idx_sd1_produto     ON stg_sd1 (filial, produto, armazem);
CREATE INDEX IF NOT EXISTS idx_sd1_tipo        ON stg_sd1 (tipo_docto);
CREATE INDEX IF NOT EXISTS idx_sd1_origem      ON stg_sd1 (docto_origem, serie_origem);
"""

REVERTE_STAGING = r"""
DROP TABLE IF EXISTS stg_sd1;
DROP INDEX IF EXISTS idx_sd2_tes;
ALTER TABLE stg_sd2 DROP COLUMN IF EXISTS desconto;
ALTER TABLE stg_sd2 DROP COLUMN IF EXISTS grupo_doc;
ALTER TABLE stg_sd2 DROP COLUMN IF EXISTS desc_item;
ALTER TABLE stg_sd2 DROP COLUMN IF EXISTS loja;
ALTER TABLE stg_sb2 DROP COLUMN IF EXISTS sld_atu;
"""

VIEWS = r"""
DROP MATERIALIZED VIEW IF EXISTS mv_margem_sku;
DROP MATERIALIZED VIEW IF EXISTS mv_margem_vendedor;
DROP MATERIALIZED VIEW IF EXISTS mv_margem_diaria;
DROP MATERIALIZED VIEW IF EXISTS mv_margem_item;

CREATE MATERIALIZED VIEW mv_margem_item AS
WITH parametro AS (
    SELECT COALESCE((SELECT limite FROM core_paramoutlier WHERE id = 1), -1.0) AS limite
),
pedidos AS (
    -- O SC5 traz mais de uma linha por pedido (uma por nota fiscal). Sem o
    -- DISTINCT ON a receita duplicaria no join.
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
        COALESCE(b.descricao, d.desc_item)          AS descricao,
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

        -- O Protheus registra o desconto a parte: Vlr.Total continua sendo
        -- Quantidade x Vlr.Unitario. As duas medidas ficam expostas lado a lado
        -- para que a tela mostre o faturamento cheio e o efetivamente cobrado.
        COALESCE(d.desconto, 0)                     AS desconto,
        d.vlr_total - COALESCE(d.desconto, 0)       AS receita_liquida,

        -- Tipo de saida. Nenhuma linha e descartada aqui: sem cadastro em
        -- core_mapates o TES conta como venda (ver docstring de MapaTES).
        d.tes,
        COALESCE(t.gera_receita, TRUE)              AS tes_receita,

        -- Grupo (Regra 4): reclassificacao manual > grupo da linha faturada >
        -- cadastro do SB2. Vazio nunca e somado em outro grupo em silencio.
        COALESCE(r.grupo_id, NULLIF(d.grupo_doc, ''), NULLIF(b.grupo, ''))
                                                    AS grupo_codigo,
        (r.grupo_id IS NOT NULL)                    AS grupo_reclassificado,

        -- Regra 1: canal e vendedor sao dimensoes distintas. O codigo 72 (Lexos) e
        -- o integrador de marketplace, nao uma pessoa — fica fora do ranking de
        -- vendedor. O armazem NAO serve para segmentar canal.
        CASE
            WHEN mc.canal IS NOT NULL     THEN mc.canal
            WHEN d.num_pedido IS NULL     THEN 'Balcao-PDV'
            WHEN p.numero IS NULL         THEN '(pedido sem cadastro)'
            ELSE 'Venda interna'
        END                                         AS canal,
        CASE WHEN mc.canal IS NULL THEN p.vendedor      END AS vendedor_codigo,
        CASE WHEN mc.canal IS NULL THEN p.nome_vendedor END AS vendedor_nome,

        -- Regra 3: cascata de custo. D2_CUSTO1 vem como custo TOTAL da linha;
        -- dividir por quantidade e o que o deixa comparavel com o cadastro do SB2.
        COALESCE(
            NULLIF(d.custo_saida, 0) / NULLIF(d.quantidade, 0),  -- D2_CUSTO1
            NULLIF(b.custo_unitario,  0),   -- C Unitario: custo medio contabil
            NULLIF(b.vlr_ult_compra,  0),   -- V. Ult. Comp
            NULLIF(o.custo_outro_arm, 0)    -- mesmo SKU em outro armazem
        )                                           AS custo_unitario_ref,
        CASE
            WHEN NULLIF(d.custo_saida, 0) IS NOT NULL
             AND NULLIF(d.quantidade,  0) IS NOT NULL THEN 'saida'
            WHEN NULLIF(b.custo_unitario,  0) IS NOT NULL THEN 'medio'
            WHEN NULLIF(b.vlr_ult_compra,  0) IS NOT NULL THEN 'ultima_compra'
            WHEN NULLIF(o.custo_outro_arm, 0) IS NOT NULL THEN 'outro_armazem'
        END                                         AS origem_custo
    FROM stg_sd2 d
    -- Snapshot do SB2 correspondente a competencia da venda. Com o custo congelado
    -- do D2_CUSTO1 ele deixa de ser o caminho principal, mas continua atendendo as
    -- linhas de custo zero.
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
    LEFT JOIN pedidos p                 ON p.numero = d.num_pedido
    LEFT JOIN core_mapacanal mc         ON mc.codigo_vendedor = p.vendedor
    LEFT JOIN core_reclassificacaosku r ON r.sku = d.produto
    LEFT JOIN core_mapates t            ON t.codigo = d.tes
)
SELECT
    base.*,
    COALESCE(g.rotulo, '(sem classificacao)')       AS grupo_rotulo,
    quantidade * custo_unitario_ref                 AS custo_total,
    receita_bruta   - quantidade * custo_unitario_ref AS margem_bruta,
    receita_liquida - quantidade * custo_unitario_ref AS margem_liquida,
    CASE WHEN receita_bruta <> 0
         THEN (receita_bruta - quantidade * custo_unitario_ref) / receita_bruta
    END                                             AS margem_pct,
    CASE WHEN receita_liquida <> 0
         THEN (receita_liquida - quantidade * custo_unitario_ref) / receita_liquida
    END                                             AS margem_liquida_pct,

    -- Flags de qualidade. Calculadas sobre a margem BRUTA de proposito: o corte de
    -- quarentena da Regra 2 foi calibrado nela e nao deve mudar junto com o layout.
    (custo_unitario_ref IS NULL)                    AS sem_custo,
    (
        custo_unitario_ref IS NOT NULL
        AND receita_bruta <> 0
        AND (receita_bruta - quantidade * custo_unitario_ref) / receita_bruta
            < (SELECT limite FROM parametro)
    )                                               AS outlier_custo
FROM base
LEFT JOIN core_mapagrupo g ON g.codigo = base.grupo_codigo;

CREATE UNIQUE INDEX uq_mv_margem_item ON mv_margem_item (id);
CREATE INDEX idx_mvi_canal      ON mv_margem_item (canal, competencia);
CREATE INDEX idx_mvi_vendedor   ON mv_margem_item (vendedor_codigo, competencia);
CREATE INDEX idx_mvi_grupo      ON mv_margem_item (grupo_codigo, armazem, competencia);
CREATE INDEX idx_mvi_sku        ON mv_margem_item (sku, competencia);
CREATE INDEX idx_mvi_qualidade  ON mv_margem_item (sem_custo, outlier_custo);
CREATE INDEX idx_mvi_tes        ON mv_margem_item (tes, tes_receita);
CREATE INDEX idx_mvi_descricao  ON mv_margem_item USING gin (descricao gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Agregadas. So linhas aptas: sem_custo, outlier e TES que nao e venda ficam fora
-- do KPI — mas continuam em mv_margem_item, somando no faturamento.
-- ---------------------------------------------------------------------------
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
    sum(receita_liquida)         AS receita_liquida,
    sum(desconto)                AS desconto,
    sum(custo_total)             AS custo,
    sum(margem_bruta)            AS margem,
    sum(margem_liquida)          AS margem_liquida
FROM mv_margem_item
WHERE NOT sem_custo AND NOT outlier_custo AND tes_receita
GROUP BY 1, 2, 3, 4, 5, 6, 7;

CREATE UNIQUE INDEX uq_mv_margem_diaria ON mv_margem_diaria
    (emissao, canal, grupo_codigo, armazem, vendedor_codigo) NULLS NOT DISTINCT;
CREATE INDEX idx_mvd_vendedor ON mv_margem_diaria (vendedor_codigo);
CREATE INDEX idx_mvd_competencia ON mv_margem_diaria (competencia);

CREATE MATERIALIZED VIEW mv_margem_vendedor AS
SELECT
    competencia,
    vendedor_codigo,
    vendedor_nome,
    canal,
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
GROUP BY 1, 2, 4, 5, 6, 7, 8;

CREATE UNIQUE INDEX uq_mv_margem_sku ON mv_margem_sku
    (competencia, sku, grupo_codigo, canal, armazem, vendedor_codigo)
    NULLS NOT DISTINCT;
CREATE INDEX idx_mvs_vendedor ON mv_margem_sku (vendedor_codigo);
"""

REVERTE_VIEWS = r"""
DROP MATERIALIZED VIEW IF EXISTS mv_margem_sku;
DROP MATERIALIZED VIEW IF EXISTS mv_margem_vendedor;
DROP MATERIALIZED VIEW IF EXISTS mv_margem_diaria;
DROP MATERIALIZED VIEW IF EXISTS mv_margem_item;
"""


def semear_tes(apps, schema_editor):
    """Cadastra os TES observados, todos contando como venda.

    Semear com `gera_receita=True` e deliberado: o BI nao adivinha o que e remessa.
    Enquanto o negocio nao classificar, o numero permanece o mesmo de antes — o que
    muda e existir a alavanca.
    """
    from django.apps import apps as apps_reais
    from django.contrib.auth.management import create_permissions

    MapaTES = apps.get_model("core", "MapaTES")
    for codigo in TES_OBSERVADOS:
        MapaTES.objects.update_or_create(
            codigo=codigo,
            defaults={"descricao": "Venda" if codigo == "600" else ""},
        )

    # As Permission so nascem no post_migrate, ao fim de todo o `migrate`. Sem
    # forcar a criacao aqui, o grupo 'admin' ficaria sem acesso ao model novo — o
    # mesmo cuidado tomado na 0004.
    create_permissions(apps_reais.get_app_config("core"), verbosity=0)

    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    grupo = Group.objects.filter(name="admin").first()
    if grupo:
        grupo.permissions.add(
            *Permission.objects.filter(
                codename__in=[
                    "add_mapates",
                    "change_mapates",
                    "delete_mapates",
                    "view_mapates",
                ]
            )
        )


def remover_tes(apps, schema_editor):
    apps.get_model("core", "MapaTES").objects.filter(codigo__in=TES_OBSERVADOS).delete()


class Migration(migrations.Migration):
    dependencies = [("core", "0007_usuario_admin")]

    operations = [
        migrations.CreateModel(
            name="MapaTES",
            fields=[
                (
                    "codigo",
                    models.CharField(
                        max_length=10,
                        primary_key=True,
                        serialize=False,
                        verbose_name="codigo",
                    ),
                ),
                (
                    "descricao",
                    models.CharField(blank=True, max_length=120, verbose_name="descricao"),
                ),
                (
                    "gera_receita",
                    models.BooleanField(
                        default=True,
                        help_text=(
                            "Desmarque para tirar do KPI de margem as saidas que nao sao "
                            "venda (remessa, bonificacao, transferencia). Exige refresh_views."
                        ),
                        verbose_name="conta como venda",
                    ),
                ),
            ],
            options={
                "verbose_name": "tipo de saida (TES)",
                "verbose_name_plural": "tipos de saida (TES)",
                "ordering": ["codigo"],
            },
        ),
        migrations.RunSQL(STAGING, REVERTE_STAGING),
        migrations.RunSQL(VIEWS, REVERTE_VIEWS),
        migrations.RunPython(semear_tes, remover_tes),
    ]
