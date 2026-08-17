"""Perfis de acesso e escopo de dados.

O isolamento do perfil `vendedor` e feito na **clausula base** de cada consulta,
nunca filtrando o resultado em Python depois. Um filtro aplicado depois vaza dado
por qualquer caminho que esqueca de aplica-lo — agregado, exportacao, contagem.
"""

from __future__ import annotations

from dataclasses import dataclass

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

GRUPO_ADMIN = "admin"
GRUPO_GERENTE = "gerente"
GRUPO_VENDEDOR = "vendedor"


def perfis(usuario) -> set[str]:
    if usuario.is_superuser:
        return {GRUPO_ADMIN, GRUPO_GERENTE}
    return set(usuario.groups.values_list("name", flat=True))


@dataclass(frozen=True)
class Escopo:
    """Restricao de dados aplicada a todas as consultas do usuario."""

    condicao: str
    parametros: list

    @property
    def restrito(self) -> bool:
        return self.condicao != "TRUE"


ESCOPO_TOTAL = Escopo("TRUE", [])


def escopo_de(usuario) -> Escopo:
    """Monta a restricao SQL do usuario.

    admin e gerente veem tudo. O perfil `vendedor` ve apenas as proprias linhas —
    e como o canal Marketplace tem `vendedor_codigo` nulo (o codigo 72 e o
    integrador Lexos, nao uma pessoa), essas linhas ficam naturalmente invisiveis
    para ele.
    """
    meus = perfis(usuario)
    if meus & {GRUPO_ADMIN, GRUPO_GERENTE}:
        return ESCOPO_TOTAL

    if GRUPO_VENDEDOR in meus:
        vendedor = getattr(usuario, "vendedor", None)
        if vendedor is None:
            # Sem vinculo nao ha o que mostrar. Devolver tudo seria vazamento;
            # devolver vazio silenciosamente esconderia um cadastro incompleto.
            raise PermissionDenied(
                "Usuario com perfil de vendedor sem vinculo a um codigo de vendedor. "
                "Peca ao administrador para vincular em Cadastros > Vendedores."
            )
        return Escopo("vendedor_codigo = %s", [vendedor.codigo])

    raise PermissionDenied("Usuario sem perfil de acesso ao BI.")


class PodeVerBI(BasePermission):
    """Exige que o usuario tenha algum perfil reconhecido."""

    message = "Usuario sem perfil de acesso ao BI."

    def has_permission(self, request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        return bool(perfis(request.user) & {GRUPO_ADMIN, GRUPO_GERENTE, GRUPO_VENDEDOR})


class PodeAdministrar(BasePermission):
    """Restringe operacoes que alteram a base — hoje, a carga dos arquivos.

    Gerente ve tudo, mas nao carrega: uma carga errada reescreve a margem de um
    mes inteiro para todo mundo, e o estrago nao e obvio na tela.
    """

    message = "Apenas administradores podem executar esta operacao."

    def has_permission(self, request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        return GRUPO_ADMIN in perfis(request.user)
