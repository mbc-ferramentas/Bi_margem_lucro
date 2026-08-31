"""Endpoints analiticos.

Toda resposta carrega o bloco `escopo`, que declara o que o numero **nao** inclui.
Isso nao e decoracao: a fase 1 calcula margem bruta, e o canal Marketplace tem
12-19% de comissao que ainda nao esta lancada em lugar nenhum. O frontend usa esse
bloco para rotular as telas e para impedir comparacao entre canais.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.api import filtros, queries
from apps.api.permissions import PodeAdministrar, PodeVerBI, escopo_de, perfis
from apps.etl import servicos
from apps.etl.schemas import ARQUIVOS

ESCOPO_CALCULO = {
    "tipo": "margem_bruta",
    "rotulo": "Margem bruta",
    "formula": "receita - (quantidade x custo unitario)",
    "nao_inclui": [
        "comissao de marketplace",
        "impostos",
        "frete",
        "devolucoes",
        "custo financeiro",
    ],
    "aviso_marketplace": (
        "O canal Marketplace tem comissao estimada entre 12% e 19% que ainda nao "
        "esta lancada. Nao compare a margem deste canal com a da venda interna."
    ),
    "comparacao_entre_canais": False,
}


class BaseBI(APIView):
    permission_classes = [IsAuthenticated, PodeVerBI]
    coluna_data = "competencia"

    def contexto(self, request: Request):
        escopo = escopo_de(request.user)
        clausula = filtros.montar(request, escopo, self.coluna_data)
        return escopo, clausula

    def responder(self, dados: dict) -> Response:
        return Response({**dados, "escopo": ESCOPO_CALCULO})


class KpisView(BaseBI):
    """Indicadores consolidados do periodo filtrado."""

    def get(self, request: Request) -> Response:
        _, clausula = self.contexto(request)
        return self.responder({"kpis": queries.kpis(clausula)})


class SerieView(BaseBI):
    """Evolucao temporal por canal."""

    def get(self, request: Request) -> Response:
        granularidade = request.query_params.get("granularidade", "mes")
        if granularidade not in ("dia", "mes"):
            raise ValidationError({"granularidade": "Use 'dia' ou 'mes'."})

        self.coluna_data = "emissao" if granularidade == "dia" else "competencia"
        _, clausula = self.contexto(request)
        return self.responder(
            {
                "granularidade": granularidade,
                "serie": queries.serie(clausula, granularidade),
            }
        )


class VendedorView(BaseBI):
    """Ranking de rentabilidade por vendedor.

    So contempla venda interna: o codigo 72 e o integrador Lexos, nao uma pessoa.
    """

    ORDENAVEIS = {
        "margem": "sum(margem)",
        "margem_pct": "CASE WHEN sum(receita) <> 0 THEN sum(margem)/sum(receita) END",
        "receita": "sum(receita)",
        "pedidos": "sum(pedidos)",
        "nome": "vendedor_nome",
    }

    def get(self, request: Request) -> Response:
        _, clausula = self.contexto(request)
        ordem = filtros.ordenacao(request, self.ORDENAVEIS, "-margem")
        return self.responder(
            {
                "vendedores": queries.por_vendedor(clausula, ordem),
                "observacao": (
                    "Ranking restrito a venda interna. O canal Marketplace nao "
                    "possui vendedor pessoa fisica."
                ),
            }
        )


class SkuView(BaseBI):
    """Itens vendidos, com giro e margem."""

    ORDENAVEIS = {
        "margem": "sum(margem)",
        "margem_pct": "CASE WHEN sum(receita) <> 0 THEN sum(margem)/sum(receita) END",
        "receita": "sum(receita)",
        "quantidade": "sum(quantidade)",
        "sku": "sku",
    }

    def get(self, request: Request) -> Response:
        _, clausula = self.contexto(request)
        ordem = filtros.ordenacao(request, self.ORDENAVEIS, "-margem")
        limite, offset = filtros.paginacao(request)
        resultado = queries.por_sku(clausula, ordem, limite, offset)
        return self.responder({**resultado, "limite": limite, "offset": offset})


class ArmazemView(BaseBI):
    """Margem por armazem, aberta em grupo.

    A leitura principal do BI: o mesmo grupo aparece em varios armazens, entao
    armazem e a dimensao de fora e grupo a de dentro.
    """

    ORDENAVEIS = {
        "margem": "sum(margem)",
        "margem_pct": "CASE WHEN sum(receita) <> 0 THEN sum(margem)/sum(receita) END",
        "receita": "sum(receita)",
        "quantidade": "sum(quantidade)",
        "armazem": "armazem",
    }

    def get(self, request: Request) -> Response:
        _, clausula = self.contexto(request)
        # Empate por armazem mantem os grupos do mesmo armazem juntos na tabela.
        ordem = filtros.ordenacao(request, self.ORDENAVEIS, "-margem")
        return self.responder({"armazens": queries.por_armazem(clausula, ordem)})


class FiltrosView(BaseBI):
    """Opcoes disponiveis para os filtros, restritas ao escopo do usuario.

    Aceita os proprios filtros na query string: cada lista sai recortada pelas
    demais dimensoes (ver `filtros.facetas`), que e a cascata armazem > grupo.
    """

    def get(self, request: Request) -> Response:
        escopo = escopo_de(request.user)
        faceta = filtros.facetas(request, escopo, self.coluna_data)
        return self.responder({"opcoes": queries.opcoes(faceta)})


class CarteiraView(BaseBI):
    """Pedidos de venda em aberto — o que ja foi vendido e ainda nao saiu.

    Le `mv_carteira_aberta`, alimentada pelo SC6. O recorte de data e a **data de
    entrega**, nao a competencia: a carteira olha para frente, e um item com
    entrega vencida e exatamente o que a tela precisa destacar.

    O resumo vem calculado sobre o conjunto filtrado inteiro, nao sobre a pagina.
    """

    coluna_data = "dt_entrega"

    ORDENAVEIS = {
        "valor": "vlr_aberto",
        "margem": "margem_prevista",
        "margem_pct": "margem_prevista_pct",
        "quantidade": "qtd_aberta",
        "entrega": "dt_entrega",
        "dias": "dias_em_aberto",
        "pedido": "num_pedido",
        "sku": "sku",
    }

    def get(self, request: Request) -> Response:
        escopo, clausula = self.contexto(request)
        clausula = filtros.carteira(request, clausula)
        ordem = filtros.ordenacao(request, self.ORDENAVEIS, "-valor")
        limite, offset = filtros.paginacao(request)

        resultado = queries.carteira(clausula, ordem, limite, offset)
        return self.responder(
            {
                **resultado,
                "resumo": queries.carteira_resumo(clausula),
                "limite": limite,
                "offset": offset,
                "observacao": (
                    "Margem prevista: sem nota fiscal nao existe custo congelado, "
                    "entao a referencia e o cadastro de custo do SB2 mais recente. "
                    "Pedidos fora da janela do export do SC5 aparecem sem vendedor."
                ),
            }
        )


class CarteiraFiltrosView(BaseBI):
    """Opcoes de filtro da carteira.

    Separado de `/filtros`: a carteira tem pedidos fora da janela do SD2, e
    oferecer um vendedor sem item em aberto so produziria tela vazia.
    """

    coluna_data = "dt_entrega"

    def get(self, request: Request) -> Response:
        escopo = escopo_de(request.user)
        faceta = filtros.facetas(request, escopo, self.coluna_data)
        return self.responder({"opcoes": queries.carteira_opcoes(faceta)})

class EuView(APIView):
    """Identidade e perfil do usuario autenticado."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        vendedor = getattr(request.user, "vendedor", None)
        return Response(
            {
                "username": request.user.username,
                "nome": request.user.get_full_name(),
                "perfis": sorted(perfis(request.user)),
                "vendedor": (
                    {"codigo": vendedor.codigo, "nome": vendedor.nome} if vendedor else None
                ),
            }
        )


class Conflito(APIException):
    status_code = status.HTTP_409_CONFLICT


def _resumo(registros) -> list[dict]:
    return [
        {
            "arquivo": r.arquivo,
            "status": r.status,
            "linhas_lidas": r.linhas_lidas,
            "linhas_gravadas": r.linhas_gravadas,
            "competencia": r.competencia,
            "mensagem": r.mensagem,
        }
        for r in registros
    ]


class CargaView(APIView):
    """Upload dos CSVs exportados do Protheus.

    Quem alimenta o BI e o administrador, enviando os arquivos por esta tela. O
    processamento e sincrono (~5-10s no volume atual) para que ele veja na hora se
    o arquivo foi aceito: uma carga que falha silenciosamente e pior que uma que
    demora, porque o BI segue exibindo o mes anterior como se fosse o atual.

    Os CSVs vivem apenas em um diretorio temporario da requisicao. O historico
    auditavel e o Parquet particionado por `dt_carga` que o ETL grava.
    """

    permission_classes = [IsAuthenticated, PodeAdministrar]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: Request) -> Response:
        enviados = self._validar(request)

        with tempfile.TemporaryDirectory(prefix="carga-protheus-") as tmp:
            origem = Path(tmp)
            for nome, arquivo in enviados.items():
                # Gravado com o nome canonico do spec (SB2.csv...), que e como o
                # reader localiza o arquivo — o nome que o usuario deu e irrelevante.
                destino = origem / ARQUIVOS[nome].arquivo
                with destino.open("wb") as saida:
                    for pedaco in arquivo.chunks():
                        saida.write(pedaco)

            try:
                with servicos.travar():
                    registros = servicos.carregar(origem=origem, nomes=list(enviados))
            except servicos.CargaEmAndamento as exc:
                raise Conflito(str(exc)) from exc
            except servicos.ErroCarga as exc:
                raise ValidationError(
                    {"detail": str(exc), "arquivos": _resumo(exc.registros)}
                ) from exc

        return Response({"arquivos": _resumo(registros)})

    def _validar(self, request: Request) -> dict:
        desconhecidos = sorted(set(request.FILES) - set(ARQUIVOS))
        if desconhecidos:
            raise ValidationError(
                {
                    "detail": f"Arquivo nao reconhecido: {', '.join(desconhecidos)}. "
                    f"Use os campos {', '.join(sorted(ARQUIVOS))}."
                }
            )

        enviados = {nome: request.FILES[nome] for nome in sorted(request.FILES)}
        if not enviados:
            raise ValidationError(
                {"detail": f"Envie ao menos um arquivo ({', '.join(sorted(ARQUIVOS))})."}
            )

        teto = settings.MAX_UPLOAD_CSV_MB * 1024 * 1024
        grandes = [n for n, a in enviados.items() if a.size > teto]
        if grandes:
            raise ValidationError(
                {
                    "detail": f"{', '.join(sorted(grandes))}: arquivo acima do limite de "
                    f"{settings.MAX_UPLOAD_CSV_MB} MB."
                }
            )
        return enviados
