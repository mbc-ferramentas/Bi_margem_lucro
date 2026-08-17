"""Renderizacao JSON com Decimal preservado.

O encoder padrao do DRF converte Decimal para float, e float perde centavos:
9728370.20 vira 9728370.199999999. Em um BI financeiro isso e inaceitavel — os
numeros da tela precisam bater com o fechamento do financeiro.

Decimal sai como string; o frontend converte com precisao arbitraria na exibicao.
"""

from decimal import Decimal

from rest_framework.renderers import JSONRenderer
from rest_framework.utils import encoders


class EncoderDecimalComoTexto(encoders.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return str(obj)
        return super().default(obj)


class JSONRendererFinanceiro(JSONRenderer):
    encoder_class = EncoderDecimalComoTexto
