"""Indice por numero de pedido em mv_margem_item.

O drill-down de faturamento (armazem -> pedidos -> itens do pedido) agrupa e
filtra por `num_pedido`, e a view nasceu sem indice nessa coluna: os indices da
0012 cobrem canal, vendedor, grupo/armazem, sku e descricao — todas dimensoes de
agregacao, nenhuma identidade de documento.

Nenhuma view e recriada aqui, entao nao ha `refresh_views` a fazer: o indice
acompanha a materialized view existente.
"""

from django.db import migrations

CRIA = "CREATE INDEX idx_mvi_pedido ON mv_margem_item (num_pedido);"
DROPA = "DROP INDEX IF EXISTS idx_mvi_pedido;"


class Migration(migrations.Migration):
    dependencies = [("core", "0013_grupos_internos")]

    operations = [migrations.RunSQL(CRIA, DROPA)]
