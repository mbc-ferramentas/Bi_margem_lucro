"""DataFrame -> Parquet (historico auditavel) -> Postgres (staging).

Tres estrategias de carga, uma por natureza de arquivo:

- **SB2** e um snapshot de custo. Versionado por `dt_carga`: cada venda faz join com
  a fotografia do seu proprio periodo. Sem isso, recarregar o SB2 reescreveria a
  margem de meses ja fechados.
- **SC5** tem chave natural completa (`numero`) — upsert direto.
- **SD1** tampouco tem chave unica (`serie` vem vazia em parte das linhas): mesma
  carga por competencia do SD2.
- **SD2** nao tem chave unica enquanto `D2_ITEM` nao existir no export, entao a
  carga substitui a competencia inteira. Idempotente e reprocessavel.

Quando `D2_ITEM` chegar, o SD2 passa a usar `carregar_upsert` — a troca e uma linha
em `estrategia_de`.
"""

from __future__ import annotations

import logging
from datetime import date
from pathlib import Path

import polars as pl
from django.conf import settings
from django.db import connection, transaction

from .schemas import ArquivoProtheus

logger = logging.getLogger(__name__)


def gravar_parquet(spec: ArquivoProtheus, df: pl.DataFrame, dt_carga: date) -> Path:
    """Grava a fatia tipada em Parquet, particionada por data de carga.

    E o que permite reprocessar sem reler CSV e auditar de onde veio um numero
    questionado meses depois.
    """
    destino = (
        Path(settings.DIR_STAGING_PARQUET) / spec.nome.lower() / f"dt_carga={dt_carga:%Y-%m-%d}"
    )
    destino.mkdir(parents=True, exist_ok=True)
    caminho = destino / "part-0.parquet"
    df.write_parquet(caminho, compression="zstd", statistics=True)
    logger.info("%s: %d linhas -> %s", spec.nome, df.height, caminho)
    return caminho


def _copy(cur, tabela: str, df: pl.DataFrame) -> None:
    colunas = df.columns
    sql = f"COPY {tabela} ({', '.join(colunas)}) FROM STDIN"
    with cur.copy(sql) as copy:
        for linha in df.iter_rows():
            copy.write_row(linha)


def _preparar(df: pl.DataFrame, dt_carga: date) -> pl.DataFrame:
    return df.with_columns(pl.lit(dt_carga).alias("dt_carga"))


def carregar_snapshot(spec: ArquivoProtheus, df: pl.DataFrame, dt_carga: date) -> int:
    """SB2 e SC6: substitui a fotografia do dia, preservando as anteriores."""
    df = _preparar(df, dt_carga)
    with transaction.atomic(), connection.cursor() as cur:
        cur.execute(f"DELETE FROM {spec.tabela} WHERE dt_carga = %s", [dt_carga])
        _copy(cur, spec.tabela, df)
    return df.height


def carregar_periodo(spec: ArquivoProtheus, df: pl.DataFrame, dt_carga: date) -> int:
    """SD2: substitui as competencias presentes no arquivo.

    Preserva duplicatas legitimas (itens repetidos na mesma NF) porque nao tenta
    identificar linha a linha — troca o bloco inteiro do mes.
    """
    df = _preparar(df, dt_carga)
    periodos = sorted(df["competencia"].drop_nulls().unique().to_list())
    if not periodos:
        raise ValueError(f"{spec.nome}: nenhuma competencia identificada no arquivo")

    with transaction.atomic(), connection.cursor() as cur:
        cur.execute(f"DELETE FROM {spec.tabela} WHERE competencia = ANY(%s)", [periodos])
        removidas = cur.rowcount
        _copy(cur, spec.tabela, df)
    logger.info(
        "%s: competencias %s — %d linhas removidas, %d inseridas",
        spec.nome,
        [f"{p:%Y-%m}" for p in periodos],
        removidas,
        df.height,
    )
    return df.height


def carregar_upsert(spec: ArquivoProtheus, df: pl.DataFrame, dt_carga: date) -> int:
    """SC5 hoje, SD2 quando `D2_ITEM` existir."""
    df = _preparar(df, dt_carga)
    colunas = df.columns
    conflito = ", ".join(spec.chave)
    atualiza = ", ".join(f"{c} = EXCLUDED.{c}" for c in colunas if c not in spec.chave)

    with transaction.atomic(), connection.cursor() as cur:
        cur.execute(
            f"CREATE TEMP TABLE tmp_carga (LIKE {spec.tabela} INCLUDING DEFAULTS) ON COMMIT DROP"
        )
        _copy(cur, "tmp_carga", df)
        cur.execute(
            f"INSERT INTO {spec.tabela} ({', '.join(colunas)}) "
            f"SELECT {', '.join(colunas)} FROM tmp_carga "
            f"ON CONFLICT ({conflito}) DO UPDATE SET {atualiza}"
        )
    return df.height


def estrategia_de(spec: ArquivoProtheus, df: pl.DataFrame):
    """Escolhe a estrategia de carga conforme o que o arquivo oferece."""
    # SB2 e SC6 sao fotografias do dia (custo de estoque e carteira em aberto):
    # versionadas por dt_carga, cada carga substitui apenas a foto daquele dia.
    if spec.nome in ("SB2", "SC6"):
        return carregar_snapshot
    if spec.nome == "SD1":
        return carregar_periodo
    if spec.nome == "SD2":
        # Enquanto D2_ITEM nao vier preenchido, nao ha chave unica.
        tem_item = "item" in df.columns and df["item"].null_count() < df.height
        return carregar_upsert if tem_item else carregar_periodo
    return carregar_upsert


def carregar_postgres(spec: ArquivoProtheus, df: pl.DataFrame, dt_carga: date) -> int:
    estrategia = estrategia_de(spec, df)
    logger.info("%s: carga por %s", spec.nome, estrategia.__name__)
    return estrategia(spec, df, dt_carga)


VIEWS = (
    "mv_margem_item",
    "mv_margem_diaria",
    "mv_margem_vendedor",
    "mv_margem_sku",
    "mv_carteira_aberta",
)


def refresh_views(concorrente: bool | None = None) -> None:
    """Atualiza as materialized views na ordem de dependencia.

    O modo concorrente mantem as views legiveis durante a atualizacao — e o que se
    quer em producao, onde alguem pode estar olhando o dashboard no momento da
    carga. Mas `REFRESH ... CONCURRENTLY` nao pode rodar dentro de uma transacao, e
    os testes rodam justamente assim (cada teste em um bloco que sofre rollback).

    Por isso o default e decidir pelo contexto em vez de pedir ao chamador que
    acerte: quem chama de dentro de um `atomic` nao teria como saber disso.
    """
    if concorrente is None:
        concorrente = not connection.in_atomic_block
    modo = "CONCURRENTLY " if concorrente else ""
    with connection.cursor() as cur:
        for view in VIEWS:
            cur.execute(f"REFRESH MATERIALIZED VIEW {modo}{view}")
            logger.info("view atualizada: %s", view)
