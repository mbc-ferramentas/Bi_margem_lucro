"""SC6 — carteira de pedidos de venda em aberto.

O BI ate aqui so enxergava o faturado (SD2). O SC6 traz os **itens do pedido de
venda**, entregues ou nao, e com ele a carteira em aberto passa a existir no
sistema: o que ja foi vendido e ainda vai sair.

Duas decisoes ficam registradas no SQL abaixo:

- **`stg_sc6` e um snapshot versionado por `dt_carga`**, como o `stg_sb2`. O export
  nao traz `C6_ITEM`, entao nao existe chave natural unica (o mesmo SKU aparece em
  itens diferentes do mesmo pedido) — e uma carteira e, por natureza, a fotografia
  de um dia. Guardar as fotos anteriores deixa a evolucao da carteira disponivel
  sem nenhum retrabalho depois.
- **`mv_carteira_aberta` e uma view separada de `mv_margem_item`.** Pedido em aberto
  nao e receita: somar os dois na mesma view inflaria faturamento e margem. A
  carteira olha so a foto mais recente e reaproveita as mesmas tabelas de
  classificacao do negocio (canal, grupo, reclassificacao de SKU), para que um
  ajuste feito no admin valha nas duas telas.
"""

from django.db import migrations

STAGING = r"""
-- Sem C6_ITEM nao ha chave natural: o id sintetico existe para o REFRESH
-- CONCURRENTLY da view ter uma coluna unica em que se apoiar.
CREATE TABLE IF NOT EXISTS stg_sc6 (
    id                 uuid PRIMARY KEY DEFAULT uuidv7(),
    filial             text NOT NULL,
    num_pedido         text NOT NULL,
    produto            text NOT NULL,
    descricao          text,
    unidade            text,
    quantidade         numeric(18,4),
    vlr_unitario       numeric(18,4),   -- C6_PRCVEN
    vlr_total          numeric(18,4),
    armazem            text,
    qtd_entregue       numeric(18,4),   -- C6_QTDENT
    dt_entrega         date,            -- C6_ENTREG
    nota_fiscal        text,            -- vazia enquanto o item nao foi faturado
    serie_nf           text,
    dt_ult_faturamento date,
    vlr_desconto       numeric(18,4),
    pct_desconto       numeric(18,4),
    cliente            text,
    loja               text,
    ped_cliente        text,            -- vazias no export atual
    nf_original        text,
    serie_origem       text,
    endereco           text,
    dt_carga           date NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sc6_dt_carga ON stg_sc6 (dt_carga);
CREATE INDEX IF NOT EXISTS idx_sc6_pedido   ON stg_sc6 (num_pedido);
CREATE INDEX IF NOT EXISTS idx_sc6_produto  ON stg_sc6 (filial, produto, armazem);
-- Indice parcial: a carteira le sempre o recorte "sem nota fiscal".
CREATE INDEX IF NOT EXISTS idx_sc6_aberto   ON stg_sc6 (dt_carga)
    WHERE nota_fiscal IS NULL;
"""

REVERTE_STAGING = r"""
DROP TABLE IF EXISTS stg_sc6;
"""

VIEWS = r"""
DROP MATERIALIZED VIEW IF EXISTS mv_carteira_aberta;

CREATE MATERIALIZED VIEW mv_carteira_aberta AS
WITH foto AS (
    -- A carteira e o estado de hoje, nao um historico: so a ultima foto entra.
    SELECT max(dt_carga) AS dt_carga FROM stg_sc6
),
foto_sb2 AS (
    SELECT max(dt_carga) AS dt_carga FROM stg_sb2
),
pedidos AS (
    -- Mesmo DISTINCT ON de mv_margem_item: o SC5 traz uma linha por nota fiscal
    -- do pedido, e sem isso o join multiplicaria os itens da carteira.
    SELECT DISTINCT ON (numero)
           numero, vendedor, nome_vendedor, cliente, nome_cliente, dt_emissao
    FROM stg_sc5
    ORDER BY numero
),
base AS (
    SELECT
        c.id,
        c.filial,
        c.num_pedido,
        c.produto                                    AS sku,
        COALESCE(NULLIF(b.descricao, ''), c.descricao) AS descricao,
        c.armazem,
        c.unidade,
        c.dt_entrega,
        p.dt_emissao,
        -- Preenchidas quando o item foi faturado parcialmente; e a ponte com o SD2.
        c.nota_fiscal,
        c.serie_nf,
        c.cliente                                    AS cod_cliente,
        p.nome_cliente,

        c.quantidade                                 AS qtd_pedida,
        COALESCE(c.qtd_entregue, 0)                  AS qtd_entregue,
        c.quantidade - COALESCE(c.qtd_entregue, 0)   AS qtd_aberta,
        c.vlr_unitario,
        (c.quantidade - COALESCE(c.qtd_entregue, 0)) * c.vlr_unitario AS vlr_aberto,
        COALESCE(c.vlr_desconto, 0)                  AS vlr_desconto,

        -- Grupo: mesma precedencia de mv_margem_item, sem o grupo da linha
        -- faturada (que so existe depois da nota).
        COALESCE(r.grupo_id, NULLIF(b.grupo, ''))    AS grupo_codigo,
        (r.grupo_id IS NOT NULL)                     AS grupo_reclassificado,

        -- Canal e vendedor: mesma regra da margem. O integrador de marketplace
        -- cadastrado em core_mapacanal nao entra como vendedor.
        CASE
            WHEN mc.canal IS NOT NULL THEN mc.canal
            WHEN p.numero IS NULL     THEN '(pedido sem cadastro)'
            ELSE 'Venda interna'
        END                                          AS canal,
        CASE WHEN mc.canal IS NULL THEN p.vendedor      END AS vendedor_codigo,
        CASE WHEN mc.canal IS NULL THEN p.nome_vendedor END AS vendedor_nome,

        -- Custo previsto: cascata reduzida da Regra 3. Sem nota nao existe
        -- D2_CUSTO1, entao a referencia e o cadastro do SB2 mais recente.
        COALESCE(
            NULLIF(b.custo_unitario, 0),
            NULLIF(b.vlr_ult_compra, 0)
        )                                            AS custo_unitario_ref,

        -- Idade e atraso: e o que transforma a lista num relatorio de cobranca.
        (CURRENT_DATE - p.dt_emissao)                AS dias_em_aberto,
        (c.dt_entrega IS NOT NULL AND c.dt_entrega < CURRENT_DATE) AS atrasado,
        c.dt_carga
    FROM stg_sc6 c
    JOIN foto f ON f.dt_carga = c.dt_carga
    LEFT JOIN foto_sb2 fb ON TRUE
    LEFT JOIN stg_sb2 b
           ON b.filial   = c.filial
          AND b.produto  = c.produto
          AND b.armazem  = c.armazem
          AND b.dt_carga = fb.dt_carga
    LEFT JOIN pedidos p                 ON p.numero = c.num_pedido
    LEFT JOIN core_mapacanal mc         ON mc.codigo_vendedor = p.vendedor
    LEFT JOIN core_reclassificacaosku r ON r.sku = c.produto
    -- Em aberto: nao faturado, ou faturado apenas em parte.
    WHERE c.nota_fiscal IS NULL
       OR COALESCE(c.qtd_entregue, 0) < c.quantidade
)
SELECT
    base.*,
    COALESCE(g.rotulo, '(sem classificacao)')        AS grupo_rotulo,
    qtd_aberta * custo_unitario_ref                  AS custo_aberto,
    vlr_aberto - qtd_aberta * custo_unitario_ref     AS margem_prevista,
    CASE WHEN vlr_aberto <> 0
         THEN (vlr_aberto - qtd_aberta * custo_unitario_ref) / vlr_aberto
    END                                              AS margem_prevista_pct,
    (custo_unitario_ref IS NULL)                     AS sem_custo
FROM base
LEFT JOIN core_mapagrupo g ON g.codigo = base.grupo_codigo;

-- Obrigatorio para o REFRESH ... CONCURRENTLY de writers.refresh_views.
CREATE UNIQUE INDEX uq_mv_carteira_aberta ON mv_carteira_aberta (id);
CREATE INDEX idx_mvc_vendedor ON mv_carteira_aberta (vendedor_codigo);
CREATE INDEX idx_mvc_canal    ON mv_carteira_aberta (canal);
CREATE INDEX idx_mvc_sku      ON mv_carteira_aberta (sku);
CREATE INDEX idx_mvc_entrega  ON mv_carteira_aberta (dt_entrega);
CREATE INDEX idx_mvc_pedido   ON mv_carteira_aberta (num_pedido);
CREATE INDEX idx_mvc_grupo    ON mv_carteira_aberta (grupo_codigo, armazem);
"""

REVERTE_VIEWS = r"""
DROP MATERIALIZED VIEW IF EXISTS mv_carteira_aberta;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0009_redefinir_senha_admin")]

    operations = [
        migrations.RunSQL(STAGING, REVERTE_STAGING),
        migrations.RunSQL(VIEWS, REVERTE_VIEWS),
    ]
