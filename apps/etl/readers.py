"""CSV bruto do Protheus -> DataFrame Polars tipado."""

from __future__ import annotations

import logging
from pathlib import Path

import polars as pl

from .schemas import ENCODING, LINHAS_LIXO, SEPARADOR, ArquivoProtheus

logger = logging.getLogger(__name__)


class ErroLeitura(Exception):
    """Falha estrutural no arquivo — aborta a carga em vez de gravar dado errado."""


def _para_decimal(coluna: str) -> pl.Expr:
    """Converte o decimal brasileiro do Protheus para Decimal(18,4).

    Trata '1.234,56' (separador de milhar) e '65,52'. O ponto e removido antes da
    troca da virgula, senao '1.234,56' viraria 1.23456.
    """
    return (
        pl.col(coluna)
        .cast(pl.String)
        .str.strip_chars()
        .str.replace_all(r"\.", "")
        .str.replace(",", ".")
        .replace("", None)
        .cast(pl.Decimal(18, 4), strict=False)
        .alias(coluna)
    )


def _para_data(coluna: str) -> pl.Expr:
    return (
        pl.col(coluna)
        .cast(pl.String)
        .str.strip_chars()
        .replace("", None)
        .str.to_date("%d/%m/%Y", strict=False)
        .alias(coluna)
    )


def ler(
    spec: ArquivoProtheus, caminho: Path, auditoria: dict | None = None
) -> pl.DataFrame:
    """Le um arquivo do Protheus aplicando o contrato definido em schemas.py.

    Tudo entra como String e e convertido depois. A inferencia automatica de tipo
    corromperia dois campos: codigos de produto com zeros a esquerda (viram int) e
    'Num Ped Clie', que ja chega em notacao cientifica.

    `auditoria`, quando informado, recebe o que a limpeza fez com o dado. Sem ele
    esses numeros so iam para o log, e o log nao responde "por que o SD2 de julho
    entrou com 300 linhas a menos" semanas depois.
    """
    if auditoria is None:
        auditoria = {}
    if not caminho.exists():
        raise ErroLeitura(f"{spec.nome}: arquivo nao encontrado em {caminho}")

    df = pl.read_csv(
        caminho,
        separator=SEPARADOR,
        encoding=ENCODING,
        skip_rows=LINHAS_LIXO,
        infer_schema_length=0,  # tudo como String
        truncate_ragged_lines=True,
        ignore_errors=True,
    )

    presentes = set(df.columns)
    esperadas = set(spec.colunas)
    opcionais_ausentes = {
        origem for origem, destino in spec.colunas.items() if destino in spec.opcionais
    } - presentes
    faltando = esperadas - presentes - opcionais_ausentes
    auditoria["linhas_brutas"] = df.height
    auditoria["colunas_ausentes"] = sorted(faltando)
    auditoria["opcionais_ausentes"] = sorted(opcionais_ausentes)
    if faltando:
        raise ErroLeitura(
            f"{spec.nome}: colunas obrigatorias ausentes no CSV: {sorted(faltando)}"
        )
    if opcionais_ausentes:
        logger.info(
            "%s: colunas opcionais ainda ausentes no export: %s",
            spec.nome,
            sorted(opcionais_ausentes),
        )

    usadas = {o: d for o, d in spec.colunas.items() if o in presentes}
    df = df.select(list(usadas)).rename(usadas)

    # Normaliza texto antes de qualquer filtro: campos vazios do Protheus vem com
    # espacos, e '' precisa virar NULL para as regras de obrigatoriedade valerem.
    df = df.with_columns(
        pl.col(c).cast(pl.String).str.strip_chars().replace("", None) for c in df.columns
    )

    linhas_lidas = df.height
    if spec.obrigatorias:
        df = df.drop_nulls(subset=list(spec.obrigatorias))
        descartadas = linhas_lidas - df.height
        auditoria["descartadas_obrigatorias"] = descartadas
        auditoria["colunas_obrigatorias"] = list(spec.obrigatorias)
        if descartadas:
            logger.info(
                "%s: %d linhas descartadas por falta de %s",
                spec.nome,
                descartadas,
                list(spec.obrigatorias),
            )

    # Conversao com strict=False vira NULL em silencio; conta-se o que era texto
    # preenchido antes e deixou de ser valor depois.
    convertidas = [c for c in (*spec.numericas, *spec.datas) if c in df.columns]
    nulos_antes = {c: df[c].null_count() for c in convertidas}

    if spec.numericas:
        df = df.with_columns(
            [_para_decimal(c) for c in spec.numericas if c in df.columns]
        )
    if spec.datas:
        df = df.with_columns([_para_data(c) for c in spec.datas if c in df.columns])

    for chave, colunas in (("numeros_invalidos", spec.numericas), ("datas_invalidas", spec.datas)):
        auditoria[chave] = {
            c: df[c].null_count() - nulos_antes[c]
            for c in colunas
            if c in nulos_antes and df[c].null_count() > nulos_antes[c]
        }

    # O CSV traz os codigos sem zeros a esquerda ('57', '128', '2'); o negocio usa
    # '0057'/'0128' e '02'. Vale para o grupo do cadastro (SB2/SD1), o da linha
    # faturada (SD2) e o armazem (SB2/SD2/SD1/SC6 — o SC5 nao tem armazem).
    # Sem o padding do armazem o proprio `ORDER BY armazem` ordena '13' antes de '2'.
    for coluna, largura in (("grupo", 4), ("grupo_doc", 4), ("armazem", 2)):
        if coluna in df.columns:
            df = df.with_columns(pl.col(coluna).str.zfill(largura).alias(coluna))

    # Competencia: chave de particao da carga (substituicao do mes inteiro).
    if spec.coluna_competencia and spec.coluna_competencia in df.columns:
        df = df.with_columns(
            pl.col(spec.coluna_competencia).dt.truncate("1mo").alias("competencia")
        )
        auditoria["sem_competencia"] = df["competencia"].null_count()

    # Colunas opcionais ausentes entram como NULL para o schema do banco bater.
    for destino in spec.opcionais:
        if destino not in df.columns:
            tipo = pl.Decimal(18, 4) if destino in spec.numericas else pl.String
            df = df.with_columns(pl.lit(None, dtype=tipo).alias(destino))

    # Deduplicacao so quando a chave natural esta completa. Sem D2_ITEM a chave do
    # SD2 fica incompleta e deduplicar apagaria itens legitimos repetidos na NF.
    auditoria["duplicatas_removidas"] = 0
    if spec.chave and all(c in df.columns for c in spec.chave):
        chave_completa = not any(
            df[c].null_count() == df.height for c in spec.chave if c in spec.opcionais
        )
        if chave_completa:
            antes = df.height
            df = df.unique(subset=list(spec.chave), keep="last")
            auditoria["duplicatas_removidas"] = antes - df.height
            if antes != df.height:
                logger.info("%s: %d duplicatas removidas pela chave natural",
                            spec.nome, antes - df.height)

    return df


LIMITE_DIVERGENCIA = 0.005


def validar(spec: ArquivoProtheus, df: pl.DataFrame, auditoria: dict | None = None) -> None:
    """Validacoes que abortam a carga.

    Falhar ruidosamente e melhor que publicar numero errado no BI.
    """
    if auditoria is None:
        auditoria = {}
    if df.is_empty():
        raise ErroLeitura(f"{spec.nome}: nenhuma linha valida apos a limpeza")

    # Coerencia aritmetica: Vlr.Total deve bater com Quantidade x Vlr.Unitario.
    #
    # Linhas com quantidade zero ficam de fora da conferencia: sao notas de
    # complemento (SD1 com 'Tipo Docto.' = 'C'), que lancam valor sem quantidade —
    # 5.481 no arquivo de 2025. Incluir essas linhas faria a validacao acusar 2,96%
    # de divergencia num arquivo integro.
    if {"quantidade", "vlr_unitario", "vlr_total"} <= set(df.columns):
        antes = df.height
        df = df.filter(pl.col("quantidade").cast(pl.Float64) != 0)
        auditoria["linhas_quantidade_zero"] = antes - df.height
        if df.is_empty():
            return
        conferencia = df.select(
            (
                (pl.col("vlr_total").cast(pl.Float64)
                 - pl.col("quantidade").cast(pl.Float64)
                 * pl.col("vlr_unitario").cast(pl.Float64)).abs()
                > pl.max_horizontal(
                    pl.col("vlr_total").cast(pl.Float64).abs() * 0.01,
                    pl.lit(0.05),
                )
            ).sum()
        ).item()
        proporcao = conferencia / df.height
        # Registrado mesmo abaixo do limite: divergencia tolerada ainda e sinal.
        auditoria["divergencia_aritmetica"] = {
            "linhas": conferencia,
            "proporcao": round(proporcao, 6),
            "limite": LIMITE_DIVERGENCIA,
        }
        if proporcao > LIMITE_DIVERGENCIA:
            raise ErroLeitura(
                f"{spec.nome}: {conferencia} linhas ({proporcao:.2%}) com "
                f"Vlr.Total divergente de Quantidade x Vlr.Unitario"
            )


def competencias(df: pl.DataFrame) -> list:
    """Competencias presentes no arquivo, para o DELETE por periodo."""
    if "competencia" not in df.columns:
        return []
    return sorted(df["competencia"].drop_nulls().unique().to_list())
