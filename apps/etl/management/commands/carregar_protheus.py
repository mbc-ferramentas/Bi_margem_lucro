"""Carga dos arquivos exportados do Protheus.

    uv run python manage.py carregar_protheus
    uv run python manage.py carregar_protheus --arquivo SD2
    uv run python manage.py carregar_protheus --competencia 2026-07
    uv run python manage.py carregar_protheus --somente-parquet

A entrada normal em producao e o upload feito pelo administrador na tela do BI;
este comando e o caminho de linha de comando para desenvolvimento e recuperacao
manual. Os dois compartilham `apps.etl.servicos.carregar`.
"""

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.etl import servicos
from apps.etl.schemas import ARQUIVOS


class Command(BaseCommand):
    help = "Carrega SB2/SC5/SC6/SD1/SD2 do Protheus para Parquet e Postgres"

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--arquivo",
            choices=sorted(ARQUIVOS),
            action="append",
            help="Limita a carga a um ou mais arquivos (default: todos).",
        )
        parser.add_argument(
            "--origem",
            type=Path,
            default=settings.DIR_ORIGEM_CSV,
            help="Diretorio dos CSVs.",
        )
        parser.add_argument(
            "--competencia",
            help="AAAA-MM esperado no arquivo. Aborta se divergir.",
        )
        parser.add_argument(
            "--somente-parquet",
            action="store_true",
            help="Grava o Parquet sem tocar no Postgres.",
        )
        parser.add_argument(
            "--sem-refresh",
            action="store_true",
            help="Nao atualiza as materialized views ao final.",
        )

    def handle(self, *args, **opts) -> None:
        try:
            registros = servicos.carregar(
                origem=Path(opts["origem"]),
                nomes=opts["arquivo"],
                competencia=self._competencia_esperada(opts.get("competencia")),
                somente_parquet=opts["somente_parquet"],
                refresh=not opts["sem_refresh"],
            )
        except servicos.ErroCarga as exc:
            raise CommandError(str(exc)) from exc

        for r in registros:
            self.stdout.write(f"{r.arquivo}: {r.linhas_lidas:>7,} linhas -> {r.caminho_parquet}")
            if r.linhas_gravadas:
                self.stdout.write(f"{r.arquivo}: {r.linhas_gravadas:>7,} linhas gravadas")

        if any(r.linhas_gravadas for r in registros) and not opts["sem_refresh"]:
            self.stdout.write(self.style.SUCCESS("materialized views atualizadas"))

    @staticmethod
    def _competencia_esperada(valor: str | None) -> date | None:
        if not valor:
            return None
        try:
            return datetime.strptime(valor, "%Y-%m").date().replace(day=1)
        except ValueError as exc:
            raise CommandError("--competencia deve estar no formato AAAA-MM") from exc
