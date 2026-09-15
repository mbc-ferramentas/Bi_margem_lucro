"""Auditoria de dados em `ExecucaoCarga`.

So `AddField` com default: execucoes antigas continuam validas, apenas sem os
detalhes que antes iam so para o log.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0016_periodo_diario"),
    ]

    operations = [
        migrations.AddField(
            model_name="execucaocarga",
            name="lote",
            field=models.UUIDField(blank=True, db_index=True, null=True, verbose_name="lote"),
        ),
        migrations.AddField(
            model_name="execucaocarga",
            name="usuario",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="cargas",
                to=settings.AUTH_USER_MODEL,
                verbose_name="enviado por",
            ),
        ),
        migrations.AddField(
            model_name="execucaocarga",
            name="origem",
            field=models.CharField(
                choices=[("upload", "Upload na tela"), ("cli", "Linha de comando")],
                default="cli",
                max_length=10,
                verbose_name="origem",
            ),
        ),
        migrations.AddField(
            model_name="execucaocarga",
            name="nome_original",
            field=models.CharField(blank=True, max_length=255, verbose_name="nome original"),
        ),
        migrations.AddField(
            model_name="execucaocarga",
            name="tamanho_bytes",
            field=models.BigIntegerField(default=0, verbose_name="tamanho (bytes)"),
        ),
        migrations.AddField(
            model_name="execucaocarga",
            name="sha256",
            field=models.CharField(blank=True, max_length=64, verbose_name="sha256"),
        ),
        migrations.AddField(
            model_name="execucaocarga",
            name="duracao_ms",
            field=models.IntegerField(default=0, verbose_name="duracao (ms)"),
        ),
        migrations.AddField(
            model_name="execucaocarga",
            name="competencias",
            field=models.JSONField(blank=True, default=list, verbose_name="competencias"),
        ),
        migrations.AddField(
            model_name="execucaocarga",
            name="auditoria",
            field=models.JSONField(blank=True, default=dict, verbose_name="auditoria"),
        ),
    ]
