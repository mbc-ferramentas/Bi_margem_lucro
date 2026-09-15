"""Orquestracao da carga, compartilhada pela CLI e pelo endpoint de upload.

O pipeline vive aqui, e nao no management command, porque tem duas portas de
entrada: `manage.py carregar_protheus` (dev e recuperacao manual) e o upload
feito pelo administrador na tela do BI. Duplicar a orquestracao significaria
duas validacoes divergindo com o tempo — e a validacao e justamente o que impede
gravar numero errado no BI.

Erros estruturais sobem como `ErroLeitura`/`ValueError`; cada porta traduz para o
seu proprio vocabulario (`CommandError` na CLI, `ValidationError` no HTTP).
"""

from __future__ import annotations

import hashlib
import logging
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date
from pathlib import Path

from django.db import connection

from apps.core.models import ExecucaoCarga
from apps.etl import readers, writers
from apps.etl.readers import ErroLeitura
from apps.etl.schemas import ARQUIVOS

logger = logging.getLogger(__name__)

# SB2 antes de tudo: e a fotografia de custo com que as vendas fazem join. Carregar
# SD2 primeiro deixaria a margem do periodo apoiada no snapshot anterior.
# SC6 depois do SC5: a carteira faz join com o cabecalho do pedido.
ORDEM = ("SB2", "SC5", "SC6", "SD1", "SD2")

# Constante arbitraria e estavel: identifica *esta* trava no Postgres.
LOCK_CARGA = 8_150_423


class CargaEmAndamento(Exception):
    """Outra carga detem a trava. Reprocessar em paralelo corromperia o periodo."""


class ErroCarga(Exception):
    """Falha estrutural em um dos arquivos.

    Carrega os registros ja processados: quando o usuario envia os tres arquivos e
    o terceiro falha, ele precisa saber que os dois primeiros entraram — senao
    reenviaria tudo achando que nada foi gravado.
    """

    def __init__(self, mensagem: str, registros: list[ExecucaoCarga]) -> None:
        super().__init__(mensagem)
        self.registros = registros


@contextmanager
def travar() -> Iterator[None]:
    """Serializa as cargas via advisory lock do Postgres.

    Duas cargas simultaneas do mesmo arquivo competem pelo `DELETE ... WHERE
    competencia = ANY(...)` de `writers.carregar_periodo`: uma apagaria as linhas
    que a outra acabou de inserir. A trava e por sessao e some sozinha se o
    processo morrer, entao nao ha risco de ficar presa.
    """
    with connection.cursor() as cur:
        cur.execute("SELECT pg_try_advisory_lock(%s)", [LOCK_CARGA])
        if not cur.fetchone()[0]:
            raise CargaEmAndamento(
                "Ja existe uma carga em andamento. Tente novamente em instantes."
            )
    try:
        yield
    finally:
        with connection.cursor() as cur:
            cur.execute("SELECT pg_advisory_unlock(%s)", [LOCK_CARGA])


def _sha256(caminho: Path) -> str:
    """Hash em blocos: o SD1 real passa de 100 MB e nao precisa caber na memoria."""
    resumo = hashlib.sha256()
    with caminho.open("rb") as arquivo:
        for bloco in iter(lambda: arquivo.read(1024 * 1024), b""):
            resumo.update(bloco)
    return resumo.hexdigest()


def ordenar(nomes: list[str]) -> list[str]:
    return [n for n in ORDEM if n in nomes]


def carregar(
    origem: Path,
    nomes: list[str] | None = None,
    competencia: date | None = None,
    somente_parquet: bool = False,
    refresh: bool = True,
    usuario=None,
    via: str = ExecucaoCarga.Origem.CLI,
    nomes_originais: dict[str, str] | None = None,
) -> list[ExecucaoCarga]:
    """Le, valida e grava os arquivos indicados; devolve a auditoria de cada um.

    Cada arquivo gera um `ExecucaoCarga` — inclusive em caso de falha, para que o
    erro fique registrado e nao apenas na resposta de quem disparou a carga.
    """
    dt_carga = date.today()
    origem = Path(origem)
    selecionados = ordenar(nomes or list(ARQUIVOS))
    registros: list[ExecucaoCarga] = []
    lote = uuid.uuid4()
    nomes_originais = nomes_originais or {}
    houve_carga = False

    for nome in selecionados:
        spec = ARQUIVOS[nome]
        caminho = origem / spec.arquivo
        registro = ExecucaoCarga(
            arquivo=nome,
            dt_carga=dt_carga,
            lote=lote,
            usuario=usuario,
            origem=via,
            nome_original=nomes_originais.get(nome, spec.arquivo),
        )
        auditoria: dict = {}
        registro.auditoria = auditoria
        inicio = time.monotonic()

        try:
            if caminho.exists():
                registro.tamanho_bytes = caminho.stat().st_size
                registro.sha256 = _sha256(caminho)
            df = readers.ler(spec, caminho, auditoria)
            readers.validar(spec, df, auditoria)
            registro.linhas_lidas = df.height

            periodos = readers.competencias(df)
            if competencia and periodos and competencia not in periodos:
                raise ErroLeitura(
                    f"{nome}: competencia esperada {competencia:%Y-%m}, "
                    f"arquivo contem {[f'{p:%Y-%m}' for p in periodos]}"
                )
            registro.competencia = periodos[0] if periodos else None
            registro.competencias = [f"{p:%Y-%m}" for p in periodos]

            registro.caminho_parquet = str(writers.gravar_parquet(spec, df, dt_carga))

            if not somente_parquet:
                registro.linhas_gravadas = writers.carregar_postgres(
                    spec, df, dt_carga, auditoria
                )
                houve_carga = True

            registro.status = ExecucaoCarga.Status.SUCESSO

        except (ErroLeitura, ValueError) as exc:
            registro.status = ExecucaoCarga.Status.ERRO
            registro.mensagem = str(exc)
            registro.duracao_ms = int((time.monotonic() - inicio) * 1000)
            registro.save()
            registros.append(registro)
            raise ErroCarga(str(exc), registros) from exc

        registro.duracao_ms = int((time.monotonic() - inicio) * 1000)
        registro.save()
        registros.append(registro)

    if houve_carga and refresh:
        writers.refresh_views()

    return registros
