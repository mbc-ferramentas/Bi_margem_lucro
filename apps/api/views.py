"""Endpoints analiticos.

Toda resposta carrega o bloco `escopo`, que declara o que o numero **nao** inclui.
Isso nao e decoracao: a fase 1 calcula margem bruta, e o canal Marketplace tem
12-19% de comissao que ainda nao esta lancada em lugar nenhum. O frontend usa esse
bloco para rotular as telas e para impedir comparacao entre canais.
"""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
from pathlib import Path

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import APIException, NotFound, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.api import filtros, queries
from apps.api.permissions import (
    GRUPO_ADMIN,
    GRUPO_GERENTE,
    PodeAdministrar,
    PodeVerBI,
    escopo_de,
    perfis,
)
from apps.api.queries import GRANULARIDADES
from apps.core.models import ExecucaoCarga
from apps.etl import servicos
from apps.etl.schemas import ARQUIVOS

logger = logging.getLogger(__name__)

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
    # O recorte da tela e um intervalo de datas, nao um par de competencias: a
    # emissao e a unica coluna que responde a "de 15/07 a 20/08". A competencia
    # continua nas views, mas so como atalho de agregacao mensal.
    coluna_data = "emissao"

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
        if granularidade not in GRANULARIDADES:
            raise ValidationError(
                {"granularidade": f"Use um de: {', '.join(GRANULARIDADES)}."}
            )

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


class SkuDetalheView(BaseBI):
    """Um SKU aberto em pedidos, notas e vendedores — o drill-down de `Por SKU`.

    Le `mv_margem_item` sem o corte de qualidade: a lista (que vem da agregada)
    ja exclui linha sem custo e outlier, e e exatamente essa linha que quem abre o
    detalhe foi procurar. A contagem de itens fora do KPI vai no cabecalho.

    O 404 e proposital para o SKU fora do escopo, pela mesma razao de `PedidoView`.
    """

    ORDENAVEIS = {
        "emissao": "min(emissao)",
        "quantidade": "sum(quantidade)",
        "receita": "sum(receita_bruta)",
        "margem": "sum(margem_bruta)",
        "margem_pct": (
            "CASE WHEN sum(receita_bruta) <> 0 "
            "THEN sum(margem_bruta)/sum(receita_bruta) END"
        ),
        "cliente": "min(nome_cliente)",
        "pedido": queries.CHAVE_PEDIDO,
        "nota": "nota_fiscal",
    }

    def get(self, request: Request, sku: str) -> Response:
        escopo, clausula = self.contexto(request)
        ordem = filtros.ordenacao(request, self.ORDENAVEIS, "-emissao")
        limite, offset = filtros.paginacao(request)
        dados = queries.sku_detalhe(
            clausula, filtros.so_escopo(escopo), sku, ordem, limite, offset
        )
        if dados is None:
            raise NotFound("SKU nao encontrado no periodo ou fora do seu escopo.")

        # Estoque e notas de entrada vem do staging, que nao tem `vendedor_codigo`
        # — nao ha como aplicar o escopo na clausula base, e filtrar depois em
        # Python e justamente o que abre vazamento. Por isso o bloco so existe para
        # quem ja ve a base inteira.
        visiveis = bool(perfis(request.user) & {GRUPO_ADMIN, GRUPO_GERENTE})
        suprimentos = (
            queries.sku_suprimentos(sku)
            if visiveis
            else {"estoque": [], "compras": []}
        )

        return self.responder(
            {
                **dados,
                **suprimentos,
                "suprimentos_visiveis": visiveis,
                "limite": limite,
                "offset": offset,
            }
        )


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


class PedidosView(BaseBI):
    """Pedidos faturados, um por linha — o drill-down de `Por armazem`.

    Le `mv_margem_item` (SD2). E o oposto de `/carteira`, que mostra o que ainda
    **nao** foi faturado: aqui cada linha ja virou nota.

    Ao contrario dos KPIs, a lista nao aplica o corte de qualidade. Linha sem
    custo ou com outlier continua sendo faturamento e precisa aparecer, senao o
    total da tela nao bate com a nota — o corte vem como contagem por pedido.
    """

    ORDENAVEIS = {
        "margem": "sum(margem_bruta)",
        "margem_pct": (
            "CASE WHEN sum(receita_bruta) <> 0 "
            "THEN sum(margem_bruta)/sum(receita_bruta) END"
        ),
        "receita": "sum(receita_bruta)",
        "quantidade": "sum(quantidade)",
        "itens": "count(*)",
        "emissao": "min(emissao)",
        "cliente": "min(nome_cliente)",
        "nota": "min(nota_fiscal)",
        "pedido": queries.CHAVE_PEDIDO,
    }

    def get(self, request: Request) -> Response:
        _, clausula = self.contexto(request)
        ordem = filtros.ordenacao(request, self.ORDENAVEIS, "-margem")
        limite, offset = filtros.paginacao(request)
        resultado = queries.pedidos(clausula, ordem, limite, offset)
        return self.responder({**resultado, "limite": limite, "offset": offset})


class PedidoView(BaseBI):
    """Um pedido faturado: cabecalho, totais e itens.

    O 404 e proposital para o pedido fora do escopo: distinguir "nao existe" de
    "existe mas nao e seu" ja seria vazamento de informacao.
    """

    def get(self, request: Request, chave: str) -> Response:
        escopo, clausula = self.contexto(request)
        dados = queries.pedido(clausula, filtros.so_escopo(escopo), chave)
        if dados is None:
            raise NotFound("Pedido nao encontrado no periodo ou fora do seu escopo.")
        return self.responder(dados)


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


class FalhaCarga(APIException):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    default_detail = "Falha inesperada ao processar os arquivos."


def _resumo(registros) -> list[dict]:
    return [
        {
            "id": r.pk,
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
    processamento e sincrono (minutos, no volume real de ~200 MB) para que ele veja na hora se
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
                self._materializar(arquivo, origem / ARQUIVOS[nome].arquivo)

            try:
                with servicos.travar():
                    registros = servicos.carregar(
                        origem=origem,
                        nomes=list(enviados),
                        usuario=request.user,
                        via=ExecucaoCarga.Origem.UPLOAD,
                        nomes_originais={n: a.name for n, a in enviados.items()},
                    )
            except servicos.CargaEmAndamento as exc:
                raise Conflito(str(exc)) from exc
            except servicos.ErroCarga as exc:
                raise ValidationError(
                    {"detail": str(exc), "arquivos": _resumo(exc.registros)}
                ) from exc
            except Exception as exc:
                # Sem isto a falha vira um 500 mudo: some da tela e some do log da
                # aplicacao, sobrando so a linha de acesso do gunicorn. O
                # administrador precisa saber o que quebrou para decidir se reenvia.
                logger.exception("Falha inesperada na carga dos CSVs do Protheus")
                raise FalhaCarga(
                    f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__
                ) from exc

        return Response({"arquivos": _resumo(registros)})

    @staticmethod
    def _materializar(arquivo, destino: Path) -> None:
        """Coloca o upload em `destino` sem uma segunda copia de centenas de MB.

        Acima de `FILE_UPLOAD_MAX_MEMORY_SIZE` o Django ja gravou o arquivo em disco;
        copiar por `chunks()` dobraria a escrita (a carga real passa de 200 MB somados)
        e e justamente o disco que falta primeiro no container.
        """
        caminho_temp = getattr(arquivo, "temporary_file_path", None)
        if caminho_temp is not None:
            origem = caminho_temp()
            try:
                os.link(origem, destino)
                return
            except OSError:
                # Dispositivos diferentes: nao da para linkar, entao move.
                shutil.move(origem, destino)
                return

        with destino.open("wb") as saida:
            for pedaco in arquivo.chunks():
                saida.write(pedaco)

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

        # O teto e do envio inteiro, nao de cada arquivo: o que derruba a carga e o
        # corpo da requisicao (proxy reverso e RAM), e ele e a soma dos CSVs.
        teto = settings.MAX_UPLOAD_CARGA_MB * 1024 * 1024
        total = sum(a.size for a in enviados.values())
        if total > teto:
            raise ValidationError(
                {
                    "detail": f"Envio de {total / 1024 / 1024:.1f} MB acima do limite de "
                    f"{settings.MAX_UPLOAD_CARGA_MB} MB somando todos os arquivos."
                }
            )
        return enviados


def alertas_da_auditoria(auditoria: dict) -> list[str]:
    """Traduz as metricas da limpeza em avisos legiveis.

    Nenhum destes aborta a carga — por isso mesmo precisam aparecer: o arquivo
    entrou, mas nao inteiro como saiu do Protheus.
    """
    avisos = []
    if auditoria.get("descartadas_obrigatorias"):
        avisos.append(
            f"{auditoria['descartadas_obrigatorias']} linhas descartadas por campo "
            f"obrigatorio vazio ({', '.join(auditoria.get('colunas_obrigatorias', []))})"
        )
    if auditoria.get("duplicatas_removidas"):
        avisos.append(
            f"{auditoria['duplicatas_removidas']} duplicatas removidas pela chave natural"
        )
    for chave, rotulo in (("numeros_invalidos", "numero"), ("datas_invalidas", "data")):
        for coluna, qtd in (auditoria.get(chave) or {}).items():
            avisos.append(f"{qtd} valores de {rotulo} invalidos em {coluna} (gravados vazios)")
    if auditoria.get("opcionais_ausentes"):
        avisos.append(
            f"Colunas opcionais ausentes: {', '.join(auditoria['opcionais_ausentes'])}"
        )
    divergencia = auditoria.get("divergencia_aritmetica") or {}
    if divergencia.get("linhas"):
        avisos.append(
            f"{divergencia['linhas']} linhas ({divergencia['proporcao']:.2%}) com Vlr.Total "
            f"divergente de Quantidade x Vlr.Unitario"
        )
    if auditoria.get("sem_competencia"):
        avisos.append(f"{auditoria['sem_competencia']} linhas sem data de competencia")
    return avisos


def _execucao(r: ExecucaoCarga) -> dict:
    return {
        "id": r.pk,
        "lote": str(r.lote) if r.lote else None,
        "arquivo": r.arquivo,
        "status": r.status,
        "origem": r.origem,
        "usuario": r.usuario.get_username() if r.usuario else None,
        "criado_em": r.criado_em,
        "competencia": r.competencia,
        "competencias": r.competencias,
        "linhas_lidas": r.linhas_lidas,
        "linhas_gravadas": r.linhas_gravadas,
        "duracao_ms": r.duracao_ms,
        "alertas": len(alertas_da_auditoria(r.auditoria)),
        "mensagem": r.mensagem,
    }


class CargasView(APIView):
    """Historico das importacoes, mais recente primeiro."""

    permission_classes = [IsAuthenticated, PodeAdministrar]

    def get(self, request: Request) -> Response:
        limite, offset = filtros.paginacao(request, limite_maximo=200)
        consulta = ExecucaoCarga.objects.select_related("usuario")
        arquivo = request.query_params.get("arquivo")
        if arquivo:
            consulta = consulta.filter(arquivo=arquivo)
        situacao = request.query_params.get("status")
        if situacao:
            consulta = consulta.filter(status=situacao)
        total = consulta.count()
        linhas = consulta[offset : offset + limite]
        return Response(
            {
                "total": total,
                "limite": limite,
                "offset": offset,
                "linhas": [_execucao(r) for r in linhas],
            }
        )


class CargaDetalheView(APIView):
    """Uma importacao com a auditoria completa e os demais arquivos do mesmo lote."""

    permission_classes = [IsAuthenticated, PodeAdministrar]

    def get(self, request: Request, pk: int) -> Response:
        try:
            r = ExecucaoCarga.objects.select_related("usuario").get(pk=pk)
        except ExecucaoCarga.DoesNotExist as exc:
            raise NotFound("Importacao nao encontrada.") from exc
        lote = (
            ExecucaoCarga.objects.filter(lote=r.lote).exclude(pk=r.pk).order_by("pk")
            if r.lote
            else ExecucaoCarga.objects.none()
        )
        return Response(
            {
                **_execucao(r),
                "nome_original": r.nome_original,
                "tamanho_bytes": r.tamanho_bytes,
                "sha256": r.sha256,
                "dt_carga": r.dt_carga,
                "caminho_parquet": r.caminho_parquet,
                "auditoria": r.auditoria,
                "avisos": alertas_da_auditoria(r.auditoria),
                "mesmo_lote": [
                    {"id": o.pk, "arquivo": o.arquivo, "status": o.status} for o in lote
                ],
            }
        )
