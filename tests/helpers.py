"""Utilitarios dos testes.

As consultas vao direto ao banco: o BI le as views por SQL puro, e o teste
precisa exercitar exatamente esse caminho.
"""

from pathlib import Path

import pytest
from django.db import connection

ORIGEM = Path(__file__).resolve().parent.parent / "data" / "dados" / "usarei"

sem_csv = pytest.mark.skipif(
    not (ORIGEM / "SD2.csv").exists(), reason="CSVs do Protheus nao disponiveis"
)


def atualizar_views() -> None:
    """Refresh nao concorrente: os testes rodam dentro de uma transacao."""
    from apps.etl import writers

    writers.refresh_views(concorrente=False)


def consulta(sql: str, params=None) -> list[dict]:
    with connection.cursor() as cur:
        cur.execute(sql, params or [])
        colunas = [c[0] for c in cur.description]
        return [dict(zip(colunas, linha, strict=True)) for linha in cur.fetchall()]


def escalar(sql: str, params=None):
    with connection.cursor() as cur:
        cur.execute(sql, params or [])
        return cur.fetchone()[0]
