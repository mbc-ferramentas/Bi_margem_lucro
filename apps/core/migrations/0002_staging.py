"""Tabelas de staging — espelho dos arquivos exportados do Protheus.

Nao sao models Django de proposito: nada aqui e editado pela aplicacao, e o acesso
analitico e sempre por SQL sobre as materialized views.
"""

from django.db import migrations

STAGING = """
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- SB2: fotografia de estoque e custo.
-- Versionada por dt_carga: cada venda faz join com o snapshot do seu periodo.
-- Sem isso, recarregar o SB2 reescreveria a margem de meses ja fechados.
CREATE TABLE stg_sb2 (
    filial          text NOT NULL,
    produto         text NOT NULL,
    armazem         text NOT NULL,
    descricao       text,
    vlr_ult_compra  numeric(18,4),
    saldo_disp      numeric(18,4),
    saldo_atual     numeric(18,4),
    custo_unitario  numeric(18,4),
    grupo           text,
    dt_carga        date NOT NULL,
    PRIMARY KEY (filial, produto, armazem, dt_carga)
);
CREATE INDEX idx_sb2_dt_carga ON stg_sb2 (dt_carga);
CREATE INDEX idx_sb2_produto  ON stg_sb2 (filial, produto);

-- SC5: cabecalho do pedido de venda. Chave natural completa -> upsert direto.
CREATE TABLE stg_sc5 (
    numero          text PRIMARY KEY,
    cliente         text,
    loja            text,
    nome_cliente    text,
    dt_emissao      date,
    num_ped_cliente text,
    vendedor        text,
    nome_vendedor   text,
    nota_fiscal     text,
    serie           text,
    dt_carga        date NOT NULL
);
CREATE INDEX idx_sc5_vendedor ON stg_sc5 (vendedor);
CREATE INDEX idx_sc5_emissao  ON stg_sc5 (dt_emissao);

-- SD2: itens faturados.
-- Sem D2_ITEM nao ha chave unica (187 linhas duplicadas byte a byte no arquivo de
-- 07/2026, itens legitimos repetidos na mesma NF). A carga substitui a competencia
-- inteira; a constraint unica so entra quando o campo existir no export.
CREATE TABLE stg_sd2 (
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    filial        text NOT NULL,
    num_docto     text,
    serie         text,
    item          text,               -- D2_ITEM
    produto       text NOT NULL,
    unidade       text,
    quantidade    numeric(18,4),
    vlr_unitario  numeric(18,4),
    vlr_total     numeric(18,4),
    custo_saida   numeric(18,4),      -- D2_CUSTO1
    cfop          text,               -- D2_CF
    tes           text,               -- D2_TES
    num_pedido    text,
    cliente       text,
    armazem       text,
    emissao       date,
    numero_pdv    text,
    competencia   date NOT NULL,
    dt_carga      date NOT NULL
);
CREATE INDEX idx_sd2_competencia ON stg_sd2 (competencia);
CREATE INDEX idx_sd2_produto     ON stg_sd2 (filial, produto, armazem);
CREATE INDEX idx_sd2_pedido      ON stg_sd2 (num_pedido);
CREATE INDEX idx_sd2_emissao     ON stg_sd2 (emissao);

-- Snapshot do SB2 aplicavel a cada competencia: o mais recente carregado ate o fim
-- do mes; se o BI comecar a rodar depois, o mais antigo disponivel.
CREATE VIEW vw_snapshot_competencia AS
SELECT c.competencia,
       COALESCE(
           (SELECT max(b.dt_carga) FROM stg_sb2 b
             WHERE b.dt_carga <= (c.competencia + INTERVAL '1 month - 1 day')::date),
           (SELECT min(b.dt_carga) FROM stg_sb2 b)
       ) AS dt_carga
FROM (SELECT DISTINCT competencia FROM stg_sd2) c;
"""

REVERTE = """
DROP VIEW IF EXISTS vw_snapshot_competencia;
DROP TABLE IF EXISTS stg_sd2;
DROP TABLE IF EXISTS stg_sc5;
DROP TABLE IF EXISTS stg_sb2;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0001_initial")]
    operations = [migrations.RunSQL(STAGING, REVERTE)]
