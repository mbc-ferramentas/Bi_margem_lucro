"""Filtros de consulta -> clausula WHERE parametrizada.

Valores sempre vao como parametro (%s). Nomes de coluna e direcao de ordenacao
saem de listas fixas — nunca da query string.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from rest_framework.exceptions import ValidationError

from apps.api.permissions import Escopo
from apps.core.models import ARMAZEM_SEM_CODIGO, GRUPO_SEM_CLASSIFICACAO


@dataclass
class Clausula:
    condicoes: list[str] = field(default_factory=list)
    parametros: list = field(default_factory=list)

    def e(self, condicao: str, *valores) -> None:
        self.condicoes.append(condicao)
        self.parametros.extend(valores)

    def where(self, extra: str | None = None) -> str:
        partes = list(self.condicoes)
        if extra:
            partes.append(extra)
        return f"WHERE {' AND '.join(partes)}" if partes else ""


# Nomes antigos do par de datas. O filtro era competencia mensal e virou intervalo
# de datas; os aliases ficam porque a tela guarda o recorte na URL — links de
# drill-down ja compartilhados continuariam abrindo, mas sem periodo nenhum.
ALIAS_DATA = {"data_inicio": "competencia_inicio", "data_fim": "competencia_fim"}


def _data(valor: str | None, campo: str, *, fim: bool = False) -> date | None:
    """Aceita AAAA-MM-DD e AAAA-MM.

    Em AAAA-MM o mes vira o intervalo inteiro: o inicio cai no dia 1 e o fim no
    ultimo dia. Truncar os dois no dia 1 so nao dava erro visivel enquanto a
    coluna filtrada era `competencia`, que ja nasce no dia 1 — em `emissao` ou
    `dt_entrega`, `2026-07` como fim descartava 30 dos 31 dias.
    """
    if not valor:
        return None
    try:
        return datetime.strptime(valor, "%Y-%m-%d").date()
    except ValueError:
        pass
    try:
        d = datetime.strptime(valor, "%Y-%m").date()
    except ValueError as exc:
        raise ValidationError({campo: "Use AAAA-MM ou AAAA-MM-DD."}) from exc
    return _ultimo_dia(d) if fim else d


def _ultimo_dia(primeiro: date) -> date:
    proximo_mes = primeiro.replace(day=28) + timedelta(days=4)
    return proximo_mes.replace(day=1) - timedelta(days=1)


def _param_data(params, campo: str) -> str | None:
    """Valor da data pelo nome novo, caindo no alias antigo."""
    return params.get(campo) or params.get(ALIAS_DATA[campo])


def _lista(params, chave: str) -> list[str]:
    """Aceita ?canal=A&canal=B e ?canal=A,B."""
    valores: list[str] = []
    for bruto in params.getlist(chave):
        valores.extend(v.strip() for v in bruto.split(",") if v.strip())
    return valores


# Dimensao -> (chave da query string, coluna da view, sentinela do vazio).
# A sentinela e o valor que a lista de opcoes devolve para a linha sem valor
# preenchido; sem o ramo de IS NULL o filtro por ela nunca casaria nada.
DIMENSOES = (
    ("canal", "canal", None),
    ("armazem", "armazem", ARMAZEM_SEM_CODIGO),
    ("grupo", "grupo_codigo", GRUPO_SEM_CLASSIFICACAO),
    ("vendedor", "vendedor_codigo", None),
)


def montar(
    request,
    escopo: Escopo,
    coluna_data: str = "competencia",
    ignorar: frozenset[str] = frozenset(),
) -> Clausula:
    """Clausula comum a todos os endpoints, ja com o escopo do usuario.

    `ignorar` deixa de fora as dimensoes nomeadas ('competencia', 'canal',
    'armazem', 'grupo', 'vendedor'). E o que sustenta a cascata dos filtros: cada
    lista de opcoes e recortada por todos os filtros **menos o dela propria** —
    senao escolher um armazem travaria o proprio select de armazem no valor
    escolhido. O escopo do usuario nunca e ignoravel.
    """
    c = Clausula()
    params = request.query_params

    periodo = "competencia" not in ignorar
    inicio = _data(_param_data(params, "data_inicio"), "data_inicio")
    fim = _data(_param_data(params, "data_fim"), "data_fim", fim=True)
    if inicio and fim and inicio > fim:
        raise ValidationError("data_inicio nao pode ser maior que data_fim.")
    if inicio and periodo:
        c.e(f"{coluna_data} >= %s", inicio)
    if fim and periodo:
        c.e(f"{coluna_data} <= %s", fim)

    for chave, coluna, sentinela in DIMENSOES:
        if chave in ignorar:
            continue
        valores = _lista(params, chave)
        if not valores:
            continue
        # A sentinela ('Sem grupo', 'Sem armazem') e o codigo que a lista de
        # opcoes devolve para a linha vazia. As agregadas guardam essa string,
        # mas em mv_margem_item e mv_carteira_aberta a coluna e NULL — e
        # NULL = ANY(...) nunca casa. O OR cobre as duas formas; sem ele o
        # filtro zeraria 11% da receita no caso do grupo.
        if sentinela and sentinela in valores:
            c.e(f"({coluna} IS NULL OR {coluna} = ANY(%s))", valores)
        else:
            c.e(f"{coluna} = ANY(%s)", valores)

    # Escopo do usuario por ultimo: e a condicao que nao pode ser esquecida.
    if escopo.restrito:
        c.e(escopo.condicao, *escopo.parametros)

    return c


def so_escopo(escopo: Escopo) -> Clausula:
    """Clausula com o escopo do usuario e nada mais.

    Serve para medir quanto de um documento ficou **fora** do recorte da tela sem
    abrir mao do RBAC: o filtro de periodo ou de armazem pode sair, o escopo do
    vendedor nunca.
    """
    c = Clausula()
    if escopo.restrito:
        c.e(escopo.condicao, *escopo.parametros)
    return c


def facetas(request, escopo: Escopo, coluna_data: str = "competencia"):
    """Fabrica de clausulas para as listas de opcoes.

    `facetas(...)("grupo")` devolve a clausula com tudo aplicado menos o filtro
    de grupo — a lista de grupos precisa continuar mostrando as alternativas ao
    grupo ja escolhido. Passe `None` para a clausula completa.
    """

    def para(dimensao: str | None) -> Clausula:
        return montar(
            request,
            escopo,
            coluna_data,
            ignorar=frozenset([dimensao]) if dimensao else frozenset(),
        )

    return para


def carteira(request, clausula: Clausula) -> Clausula:
    """Filtros exclusivos da carteira, aplicados sobre a clausula comum.

    `situacao` e `busca` nao existem nas telas de margem: la o recorte e o
    periodo, aqui e a cobranca — quem ja venceu, e onde esta um pedido especifico.
    """
    situacao = request.query_params.get("situacao")
    if situacao == "atrasados":
        clausula.e("atrasado")
    elif situacao == "a_vencer":
        clausula.e("NOT atrasado")
    elif situacao:
        raise ValidationError({"situacao": "Use 'atrasados' ou 'a_vencer'."})

    busca = (request.query_params.get("busca") or "").strip()
    if busca:
        # Numero de pedido, codigo ou descricao do item: quem abre a carteira
        # geralmente esta procurando um pedido nominal, nao explorando o total.
        clausula.e(
            "(num_pedido ILIKE %s OR sku ILIKE %s OR descricao ILIKE %s)",
            f"%{busca}%",
            f"%{busca}%",
            f"%{busca}%",
        )

    return clausula


def ordenacao(request, permitidas: dict[str, str], padrao: str) -> str:
    """Traduz ?ordenar=-margem para SQL, aceitando apenas colunas conhecidas."""
    bruto = request.query_params.get("ordenar", padrao)
    desc = bruto.startswith("-")
    chave = bruto.lstrip("-")
    if chave not in permitidas:
        raise ValidationError(
            {"ordenar": f"Use um de: {', '.join(sorted(permitidas))}."}
        )
    return f"{permitidas[chave]} {'DESC' if desc else 'ASC'} NULLS LAST"


def paginacao(request, limite_maximo: int = 500) -> tuple[int, int]:
    try:
        limite = min(int(request.query_params.get("limite", 100)), limite_maximo)
        offset = max(int(request.query_params.get("offset", 0)), 0)
    except ValueError as exc:
        raise ValidationError("limite e offset devem ser inteiros.") from exc
    return max(limite, 1), offset
