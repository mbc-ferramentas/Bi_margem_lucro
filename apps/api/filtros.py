"""Filtros de consulta -> clausula WHERE parametrizada.

Valores sempre vao como parametro (%s). Nomes de coluna e direcao de ordenacao
saem de listas fixas — nunca da query string.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

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


def _data(valor: str | None, campo: str) -> date | None:
    if not valor:
        return None
    for formato in ("%Y-%m-%d", "%Y-%m"):
        try:
            d = datetime.strptime(valor, formato).date()
            return d.replace(day=1) if formato == "%Y-%m" else d
        except ValueError:
            continue
    raise ValidationError({campo: "Use AAAA-MM ou AAAA-MM-DD."})


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
    inicio = _data(params.get("competencia_inicio"), "competencia_inicio")
    fim = _data(params.get("competencia_fim"), "competencia_fim")
    if inicio and fim and inicio > fim:
        raise ValidationError("competencia_inicio nao pode ser maior que competencia_fim.")
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
