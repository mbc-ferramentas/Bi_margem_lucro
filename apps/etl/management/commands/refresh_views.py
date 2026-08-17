"""Atualiza as materialized views de margem.

Necessario tambem depois de mexer no Admin em qualquer regra que a view consome:
ParamOutlier (corte de outlier), MapaCanal, MapaGrupo e ReclassificacaoSKU.

    uv run python manage.py refresh_views
"""

from django.core.management.base import BaseCommand

from apps.etl import writers


class Command(BaseCommand):
    help = "Atualiza as materialized views de margem"

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--nao-concorrente",
            action="store_true",
            help="Bloqueia leitura durante o refresh. Necessario dentro de transacao.",
        )

    def handle(self, *args, **opts) -> None:
        writers.refresh_views(concorrente=not opts["nao_concorrente"])
        self.stdout.write(self.style.SUCCESS("materialized views atualizadas"))
