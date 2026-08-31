"""Nota fiscal em mv_margem_item.

O drill-down de faturamento chegava ao item da venda sem dizer em qual documento
ele saiu. Pedido e nota nao sao a mesma coisa e nem se correspondem um a um: 256
pedidos do baseline sao faturados em mais de uma nota e 49 notas cobrem mais de um
pedido. Quem confere faturamento procura a **nota**, e ela nao estava publicada em
lugar nenhum — `num_docto` e `serie` paravam no staging.

A venda de balcao ganha identidade de verdade junto: ela nao tem pedido
(`numero_pdv` e o terminal, nao a venda), entao as 555 linhas eram 555 documentos
sinteticos. Pela nota sao 350 — que e o numero de vendas que realmente aconteceu.

So `mv_margem_item` muda. As agregadas sao recriadas por dependencia, com o mesmo
SQL da 0012: elas somam dimensao, e nota fiscal nao e dimensao de agregacao.
"""

from django.db import migrations

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

        -- Nota fiscal: e o documento do faturamento. O pedido diz o que foi
        -- vendido, a nota diz o que foi faturado — e os dois nao andam colados
        -- (256 pedidos saem em mais de uma nota, 49 notas cobrem mais de um
        -- pedido). Sem ela a tela nao consegue apontar a nota de uma margem.
        -- A identidade e o par: `serie` vale '1' na venda com pedido e '2' no
        -- balcao, entao o numero sozinho nao e unico. `item` vem vazio em 100%
        -- das linhas do export e por isso nao entra.
        d.num_docto                                 AS nota_fiscal,
        d.serie                                     AS serie_nf,
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
        -- Este e o codigo cru do Protheus; a consolidacao vem depois.
        COALESCE(r.grupo_id, NULLIF(d.grupo_doc, ''), NULLIF(b.grupo, ''))
                                                    AS grupo_codigo_origem,
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

    -- Consolidacao (core_mapagrupo.agrupa_em): o codigo publicado e o do grupo
    -- final, para que o filtro da API — que casa por codigo — e as agregadas
    -- somem 0129 dentro de 0128. Um salto so, garantido por MapaGrupo.clean().
    COALESCE(g0.agrupa_em_id, base.grupo_codigo_origem) AS grupo_codigo,
    COALESCE(g.rotulo, 'Sem grupo')                 AS grupo_rotulo,

    -- Armazem e a dimensao de fora da hierarquia (armazem > grupo). Dois vazios
    -- diferentes: linha sem armazem, e armazem que existe mas ninguem nomeou —
    -- este ultimo continua visivel com o codigo cru, para nao sumir da tela
    -- somando receita em silencio.
    CASE
        WHEN base.armazem IS NULL THEN 'Sem armazem'
        ELSE COALESCE(ar.rotulo, base.armazem || ' - sem cadastro')
    END                                             AS armazem_rotulo,
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
LEFT JOIN core_mapagrupo g0 ON g0.codigo = base.grupo_codigo_origem
LEFT JOIN core_mapagrupo g  ON g.codigo  = COALESCE(g0.agrupa_em_id,
                                                   base.grupo_codigo_origem)
LEFT JOIN core_mapaarmazem ar ON ar.codigo = base.armazem;

CREATE UNIQUE INDEX uq_mv_margem_item ON mv_margem_item (id);
CREATE INDEX idx_mvi_canal      ON mv_margem_item (canal, competencia);
CREATE INDEX idx_mvi_vendedor   ON mv_margem_item (vendedor_codigo, competencia);
CREATE INDEX idx_mvi_armazem    ON mv_margem_item (armazem, grupo_codigo, competencia);
CREATE INDEX idx_mvi_sku        ON mv_margem_item (sku, competencia);
CREATE INDEX idx_mvi_qualidade  ON mv_margem_item (sem_custo, outlier_custo);
CREATE INDEX idx_mvi_tes        ON mv_margem_item (tes, tes_receita);
CREATE INDEX idx_mvi_pedido     ON mv_margem_item (num_pedido);
CREATE INDEX idx_mvi_nota       ON mv_margem_item (nota_fiscal, serie_nf);
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
    COALESCE(grupo_codigo, 'Sem grupo') AS grupo_codigo,
    grupo_rotulo,
    armazem,
    armazem_rotulo,
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
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8;

CREATE UNIQUE INDEX uq_mv_margem_diaria ON mv_margem_diaria
    (emissao, canal, grupo_codigo, armazem, vendedor_codigo) NULLS NOT DISTINCT;
CREATE INDEX idx_mvd_vendedor ON mv_margem_diaria (vendedor_codigo);
CREATE INDEX idx_mvd_competencia ON mv_margem_diaria (competencia);
-- A leitura principal do BI: armazem por fora, grupo por dentro.
CREATE INDEX idx_mvd_armazem ON mv_margem_diaria (armazem, grupo_codigo, competencia);

-- O armazem entra aqui porque o filtro de armazem e montado igual para TODOS os
-- endpoints (apps/api/filtros.py): sem a coluna, /margem/vendedor?armazem=02
-- estourava 'column "armazem" does not exist' com o usuario apenas clicando no
-- select da tela Por vendedor.
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
  AND vendedor_codigo IS NOT NULL   -- Marketplace nao entra em ranking de pessoa
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
        COALESCE(r.grupo_id, NULLIF(b.grupo, ''))    AS grupo_codigo_origem,
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
    -- Mesma consolidacao de mv_margem_item.
    COALESCE(g0.agrupa_em_id, base.grupo_codigo_origem) AS grupo_codigo,
    COALESCE(g.rotulo, 'Sem grupo')                  AS grupo_rotulo,
    CASE
        WHEN base.armazem IS NULL THEN 'Sem armazem'
        ELSE COALESCE(ar.rotulo, base.armazem || ' - sem cadastro')
    END                                              AS armazem_rotulo,
    qtd_aberta * custo_unitario_ref                  AS custo_aberto,
    vlr_aberto - qtd_aberta * custo_unitario_ref     AS margem_prevista,
    CASE WHEN vlr_aberto <> 0
         THEN (vlr_aberto - qtd_aberta * custo_unitario_ref) / vlr_aberto
    END                                              AS margem_prevista_pct,
    (custo_unitario_ref IS NULL)                     AS sem_custo
FROM base
LEFT JOIN core_mapagrupo g0 ON g0.codigo = base.grupo_codigo_origem
LEFT JOIN core_mapagrupo g  ON g.codigo  = COALESCE(g0.agrupa_em_id,
                                                   base.grupo_codigo_origem)
LEFT JOIN core_mapaarmazem ar ON ar.codigo = base.armazem;

-- Obrigatorio para o REFRESH ... CONCURRENTLY de writers.refresh_views.
CREATE UNIQUE INDEX uq_mv_carteira_aberta ON mv_carteira_aberta (id);
CREATE INDEX idx_mvc_vendedor ON mv_carteira_aberta (vendedor_codigo);
CREATE INDEX idx_mvc_canal    ON mv_carteira_aberta (canal);
CREATE INDEX idx_mvc_sku      ON mv_carteira_aberta (sku);
CREATE INDEX idx_mvc_entrega  ON mv_carteira_aberta (dt_entrega);
CREATE INDEX idx_mvc_pedido   ON mv_carteira_aberta (num_pedido);
CREATE INDEX idx_mvc_armazem  ON mv_carteira_aberta (armazem, grupo_codigo);
"""

# A definicao da 0012, sem nota fiscal — o estado para onde o reverso volta.
REVERTE_VIEWS = r"""
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
        -- Este e o codigo cru do Protheus; a consolidacao vem depois.
        COALESCE(r.grupo_id, NULLIF(d.grupo_doc, ''), NULLIF(b.grupo, ''))
                                                    AS grupo_codigo_origem,
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

    -- Consolidacao (core_mapagrupo.agrupa_em): o codigo publicado e o do grupo
    -- final, para que o filtro da API — que casa por codigo — e as agregadas
    -- somem 0129 dentro de 0128. Um salto so, garantido por MapaGrupo.clean().
    COALESCE(g0.agrupa_em_id, base.grupo_codigo_origem) AS grupo_codigo,
    COALESCE(g.rotulo, 'Sem grupo')                 AS grupo_rotulo,

    -- Armazem e a dimensao de fora da hierarquia (armazem > grupo). Dois vazios
    -- diferentes: linha sem armazem, e armazem que existe mas ninguem nomeou —
    -- este ultimo continua visivel com o codigo cru, para nao sumir da tela
    -- somando receita em silencio.
    CASE
        WHEN base.armazem IS NULL THEN 'Sem armazem'
        ELSE COALESCE(ar.rotulo, base.armazem || ' - sem cadastro')
    END                                             AS armazem_rotulo,
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
LEFT JOIN core_mapagrupo g0 ON g0.codigo = base.grupo_codigo_origem
LEFT JOIN core_mapagrupo g  ON g.codigo  = COALESCE(g0.agrupa_em_id,
                                                   base.grupo_codigo_origem)
LEFT JOIN core_mapaarmazem ar ON ar.codigo = base.armazem;

CREATE UNIQUE INDEX uq_mv_margem_item ON mv_margem_item (id);
CREATE INDEX idx_mvi_canal      ON mv_margem_item (canal, competencia);
CREATE INDEX idx_mvi_vendedor   ON mv_margem_item (vendedor_codigo, competencia);
CREATE INDEX idx_mvi_armazem    ON mv_margem_item (armazem, grupo_codigo, competencia);
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
    COALESCE(grupo_codigo, 'Sem grupo') AS grupo_codigo,
    grupo_rotulo,
    armazem,
    armazem_rotulo,
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
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8;

CREATE UNIQUE INDEX uq_mv_margem_diaria ON mv_margem_diaria
    (emissao, canal, grupo_codigo, armazem, vendedor_codigo) NULLS NOT DISTINCT;
CREATE INDEX idx_mvd_vendedor ON mv_margem_diaria (vendedor_codigo);
CREATE INDEX idx_mvd_competencia ON mv_margem_diaria (competencia);
-- A leitura principal do BI: armazem por fora, grupo por dentro.
CREATE INDEX idx_mvd_armazem ON mv_margem_diaria (armazem, grupo_codigo, competencia);

-- O armazem entra aqui porque o filtro de armazem e montado igual para TODOS os
-- endpoints (apps/api/filtros.py): sem a coluna, /margem/vendedor?armazem=02
-- estourava 'column "armazem" does not exist' com o usuario apenas clicando no
-- select da tela Por vendedor.
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
  AND vendedor_codigo IS NOT NULL   -- Marketplace nao entra em ranking de pessoa
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
        COALESCE(r.grupo_id, NULLIF(b.grupo, ''))    AS grupo_codigo_origem,
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
    -- Mesma consolidacao de mv_margem_item.
    COALESCE(g0.agrupa_em_id, base.grupo_codigo_origem) AS grupo_codigo,
    COALESCE(g.rotulo, 'Sem grupo')                  AS grupo_rotulo,
    CASE
        WHEN base.armazem IS NULL THEN 'Sem armazem'
        ELSE COALESCE(ar.rotulo, base.armazem || ' - sem cadastro')
    END                                              AS armazem_rotulo,
    qtd_aberta * custo_unitario_ref                  AS custo_aberto,
    vlr_aberto - qtd_aberta * custo_unitario_ref     AS margem_prevista,
    CASE WHEN vlr_aberto <> 0
         THEN (vlr_aberto - qtd_aberta * custo_unitario_ref) / vlr_aberto
    END                                              AS margem_prevista_pct,
    (custo_unitario_ref IS NULL)                     AS sem_custo
FROM base
LEFT JOIN core_mapagrupo g0 ON g0.codigo = base.grupo_codigo_origem
LEFT JOIN core_mapagrupo g  ON g.codigo  = COALESCE(g0.agrupa_em_id,
                                                   base.grupo_codigo_origem)
LEFT JOIN core_mapaarmazem ar ON ar.codigo = base.armazem;

-- Obrigatorio para o REFRESH ... CONCURRENTLY de writers.refresh_views.
CREATE UNIQUE INDEX uq_mv_carteira_aberta ON mv_carteira_aberta (id);
CREATE INDEX idx_mvc_vendedor ON mv_carteira_aberta (vendedor_codigo);
CREATE INDEX idx_mvc_canal    ON mv_carteira_aberta (canal);
CREATE INDEX idx_mvc_sku      ON mv_carteira_aberta (sku);
CREATE INDEX idx_mvc_entrega  ON mv_carteira_aberta (dt_entrega);
CREATE INDEX idx_mvc_pedido   ON mv_carteira_aberta (num_pedido);
CREATE INDEX idx_mvc_armazem  ON mv_carteira_aberta (armazem, grupo_codigo);
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
    dependencies = [("core", "0014_indice_pedido")]

    operations = [
        migrations.RunSQL(VIEWS, REVERTE_VIEWS),
        migrations.RunPython(refrescar, refrescar),
    ]
