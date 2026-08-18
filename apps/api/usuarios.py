"""Cadastro de usuarios do BI.

Quem opera o BI e o administrador, e ele nao tem acesso ao Django Admin em
producao — entao criar conta, trocar perfil e devolver acesso a quem esqueceu a
senha precisa existir aqui, na propria aplicacao.

Duas barreiras moldam tudo neste modulo:

1. **A conta protegida e intocavel.** `Usuario.protegido` marca a conta
   administrativa de emergencia. Ela aparece na lista (esconder so geraria
   confusao) mas nao aceita alteracao, remocao nem troca de senha por esta API —
   nem pelo proprio dono. E a saida de emergencia: se alguem errar as permissoes,
   ela continua entrando. Mudar exige acesso direto ao banco.

2. **Ninguem se tranca para fora.** O admin nao remove o proprio perfil, nao se
   desativa e nao se remove. Sem isso, um clique deixa o BI sem nenhum
   administrador e a unica saida vira o `manage.py` no servidor.

A senha nunca e devolvida pela API: o admin a define e a comunica. Nao ha fluxo
de e-mail porque o ambiente nao tem SMTP configurado — inventar um so produziria
reset que nunca chega.
"""

from __future__ import annotations

from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as ErroDjango
from django.db import transaction
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.api.permissions import (
    GRUPO_ADMIN,
    GRUPO_GERENTE,
    GRUPO_VENDEDOR,
    PodeAdministrar,
)
from apps.core.models import Usuario, Vendedor

PERFIS = (GRUPO_ADMIN, GRUPO_GERENTE, GRUPO_VENDEDOR)


def perfil_de(usuario: Usuario) -> str:
    """Perfil unico da conta.

    O modelo do Django permite varios grupos; o BI trabalha com um so, porque
    "gerente + vendedor" nao significa nada — o escopo mais amplo simplesmente
    engole o outro. Se o banco tiver mais de um (cadastro antigo, feito pelo
    Admin), vence o mais amplo, que e o que a pessoa ja enxerga hoje.
    """
    grupos = set(usuario.groups.values_list("name", flat=True))
    for perfil in PERFIS:
        if perfil in grupos:
            return perfil
    return ""


def serializar(usuario: Usuario) -> dict:
    vendedor = getattr(usuario, "vendedor", None)
    return {
        "id": usuario.id,
        "username": usuario.username,
        "nome": usuario.get_full_name(),
        "email": usuario.email,
        "perfil": perfil_de(usuario),
        "ativo": usuario.is_active,
        "protegido": usuario.protegido,
        "ultimo_acesso": usuario.last_login,
        "vendedor": ({"codigo": vendedor.codigo, "nome": vendedor.nome} if vendedor else None),
    }


def validar_senha(senha: str, usuario: Usuario | None = None) -> str:
    try:
        validate_password(senha, usuario)
    except ErroDjango as exc:
        raise serializers.ValidationError(list(exc.messages)) from exc
    return senha


class SenhaSerializer(serializers.Serializer):
    """Reset de senha feito pelo administrador."""

    senha = serializers.CharField(trim_whitespace=False)

    def validate_senha(self, valor: str) -> str:
        return validar_senha(valor, self.context.get("usuario"))


class UsuarioSerializer(serializers.Serializer):
    """Criacao e edicao. O `perfil` e o vinculo de vendedor andam juntos.

    Um usuario com perfil `vendedor` sem codigo vinculado nao consegue abrir tela
    nenhuma (o escopo recusa a requisicao). Exigir o codigo aqui e o que impede
    criar uma conta que so falha no primeiro login.
    """

    username = serializers.RegexField(r"^[\w.@+-]+$", max_length=150)
    nome = serializers.CharField(max_length=150, allow_blank=True, required=False)
    email = serializers.EmailField(allow_blank=True, required=False)
    perfil = serializers.ChoiceField(choices=PERFIS)
    ativo = serializers.BooleanField(required=False, default=True)
    vendedor_codigo = serializers.CharField(
        max_length=10, allow_blank=True, allow_null=True, required=False
    )
    senha = serializers.CharField(required=False, trim_whitespace=False)

    def __init__(self, *args, instancia: Usuario | None = None, **kwargs):
        self.instancia = instancia
        super().__init__(*args, **kwargs)

    def validate_username(self, valor: str) -> str:
        existentes = Usuario.objects.filter(username__iexact=valor)
        if self.instancia:
            existentes = existentes.exclude(pk=self.instancia.pk)
        if existentes.exists():
            raise serializers.ValidationError("Ja existe um usuario com este login.")
        return valor

    def validate_senha(self, valor: str) -> str:
        return validar_senha(valor, self.instancia)

    def validate(self, dados: dict) -> dict:
        if self.instancia is None and not dados.get("senha"):
            raise serializers.ValidationError({"senha": "Defina a senha inicial do usuario."})

        codigo = (dados.get("vendedor_codigo") or "").strip()
        if dados["perfil"] == GRUPO_VENDEDOR:
            if not codigo:
                raise serializers.ValidationError(
                    {
                        "vendedor_codigo": "O perfil vendedor precisa de um codigo do "
                        "Protheus: e ele que define as linhas que a pessoa enxerga."
                    }
                )
            vendedor = Vendedor.objects.filter(codigo=codigo).first()
            if vendedor is None:
                raise serializers.ValidationError(
                    {"vendedor_codigo": f"Nao existe vendedor com o codigo {codigo}."}
                )
            dono = vendedor.usuario
            if dono and (self.instancia is None or dono.pk != self.instancia.pk):
                raise serializers.ValidationError(
                    {
                        "vendedor_codigo": f"O vendedor {codigo} ja esta vinculado ao "
                        f"usuario {dono.username}."
                    }
                )
            dados["vendedor"] = vendedor
        else:
            # Perfil sem escopo proprio: o vinculo anterior, se houver, e desfeito
            # no salvamento — deixa-lo para tras faria o codigo voltar sozinho se o
            # perfil fosse devolvido para vendedor mais tarde.
            dados["vendedor"] = None
        return dados

    @transaction.atomic
    def salvar(self) -> Usuario:
        dados = self.validated_data
        usuario = self.instancia or Usuario(username=dados["username"])

        nome = (dados.get("nome") or "").strip()
        usuario.username = dados["username"]
        usuario.first_name, _, usuario.last_name = nome.partition(" ")
        usuario.email = dados.get("email", "") or ""
        usuario.is_active = dados.get("ativo", True)
        if dados.get("senha"):
            usuario.set_password(dados["senha"])
        usuario.save()

        grupo, _ = Group.objects.get_or_create(name=dados["perfil"])
        usuario.groups.set([grupo])

        # O vinculo mora no Vendedor (OneToOne), entao trocar de titular exige
        # limpar o antigo antes de gravar o novo.
        antigos = Vendedor.objects.filter(usuario=usuario)
        if dados["vendedor"]:
            antigos = antigos.exclude(codigo=dados["vendedor"].codigo)
        antigos.update(usuario=None)

        if dados["vendedor"]:
            dados["vendedor"].usuario = usuario
            dados["vendedor"].save(update_fields=["usuario"])

        return usuario


def _consulta():
    return (
        Usuario.objects.all()
        .select_related("vendedor")
        .prefetch_related("groups")
        .order_by("username")
    )


def _garantir_editavel(alvo: Usuario) -> None:
    if alvo.protegido:
        raise PermissionDenied(
            f"O usuario {alvo.username} e a conta administrativa protegida: nao pode "
            f"ser alterado, removido nem ter a senha trocada pela aplicacao."
        )


class UsuariosView(APIView):
    """Lista e cria usuarios."""

    permission_classes = [IsAuthenticated, PodeAdministrar]

    def get(self, request: Request) -> Response:
        # Os vendedores acompanham a lista: o formulario precisa oferecer os
        # codigos existentes em vez de pedir que o admin os digite de cabeca, e
        # marcar quais ja tem dono evita o erro antes do envio.
        vendedores = [
            {
                "codigo": v.codigo,
                "nome": v.nome,
                "usuario": v.usuario.username if v.usuario else None,
            }
            for v in Vendedor.objects.filter(ativo=True).select_related("usuario")
        ]
        return Response(
            {
                "usuarios": [serializar(u) for u in _consulta()],
                "vendedores": vendedores,
            }
        )

    def post(self, request: Request) -> Response:
        serializador = UsuarioSerializer(data=request.data)
        serializador.is_valid(raise_exception=True)
        usuario = serializador.salvar()
        return Response(serializar(usuario), status=status.HTTP_201_CREATED)


class UsuarioView(APIView):
    """Edita, desativa ou remove um usuario."""

    permission_classes = [IsAuthenticated, PodeAdministrar]

    def patch(self, request: Request, pk: int) -> Response:
        alvo = get_object_or_404(_consulta(), pk=pk)
        _garantir_editavel(alvo)

        serializador = UsuarioSerializer(data=request.data, instancia=alvo)
        serializador.is_valid(raise_exception=True)

        if alvo.pk == request.user.pk:
            # Rebaixar-se ou desativar-se deixa o BI sem administrador se este for
            # o unico. Recusar sempre e mais facil de entender do que contar
            # quantos admins sobraram.
            if serializador.validated_data["perfil"] != GRUPO_ADMIN:
                raise PermissionDenied(
                    "Voce nao pode alterar o proprio perfil. Peca a outro administrador."
                )
            if not serializador.validated_data.get("ativo", True):
                raise PermissionDenied("Voce nao pode desativar a propria conta.")

        return Response(serializar(serializador.salvar()))

    def delete(self, request: Request, pk: int) -> Response:
        alvo = get_object_or_404(_consulta(), pk=pk)
        _garantir_editavel(alvo)
        if alvo.pk == request.user.pk:
            raise PermissionDenied("Voce nao pode remover a propria conta.")
        alvo.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SenhaView(APIView):
    """Reset de senha pelo administrador.

    Nao pede a senha atual: o cenario e justamente o de quem a esqueceu. A senha
    nova aparece uma unica vez na tela de quem redefiniu — cabe a ele comunica-la.
    """

    permission_classes = [IsAuthenticated, PodeAdministrar]

    def post(self, request: Request, pk: int) -> Response:
        alvo = get_object_or_404(Usuario.objects.all(), pk=pk)
        _garantir_editavel(alvo)

        serializador = SenhaSerializer(data=request.data, context={"usuario": alvo})
        serializador.is_valid(raise_exception=True)

        alvo.set_password(serializador.validated_data["senha"])
        alvo.save(update_fields=["password"])
        return Response({"detail": f"Senha de {alvo.username} redefinida."})
