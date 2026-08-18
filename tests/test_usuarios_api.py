"""Cadastro de usuarios pela API.

Dois grupos de teste importam mais que os demais: quem pode chamar (so admin) e
o que a conta protegida recusa. O resto e cadastro comum.
"""

import pytest
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.core.models import Usuario, Vendedor

pytestmark = pytest.mark.django_db

LISTA = "/api/v1/usuarios"
SENHA_BOA = "Margem2026!bi"


def cliente(usuario) -> APIClient:
    c = APIClient()
    c.force_authenticate(user=usuario)
    return c


def cria(username: str, perfil: str) -> Usuario:
    usuario = Usuario.objects.create_user(username=username, password="x")
    usuario.groups.add(Group.objects.get_or_create(name=perfil)[0])
    return usuario


@pytest.fixture
def admin() -> Usuario:
    return cria("gestora", "admin")


@pytest.fixture
def conta_protegida() -> Usuario:
    return Usuario.objects.get(username="admin")


# --------------------------------------------------------------------------- #
# Quem pode chamar
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("perfil", ["gerente", "vendedor"])
def test_somente_admin_lista(perfil):
    assert cliente(cria("outro", perfil)).get(LISTA).status_code == 403


def test_anonimo_nao_lista():
    assert APIClient().get(LISTA).status_code == 401


@pytest.mark.parametrize("perfil", ["gerente", "vendedor"])
def test_somente_admin_cria(perfil):
    resposta = cliente(cria("outro", perfil)).post(
        LISTA, {"username": "novo", "perfil": "gerente", "senha": SENHA_BOA}, format="json"
    )
    assert resposta.status_code == 403
    assert not Usuario.objects.filter(username="novo").exists()


# --------------------------------------------------------------------------- #
# Cadastro
# --------------------------------------------------------------------------- #


def test_cria_usuario_com_perfil(admin):
    resposta = cliente(admin).post(
        LISTA,
        {
            "username": "joana",
            "nome": "Joana Silva",
            "email": "joana@mbc.com.br",
            "perfil": "gerente",
            "senha": SENHA_BOA,
        },
        format="json",
    )
    assert resposta.status_code == 201, resposta.json()
    assert resposta.json()["perfil"] == "gerente"
    assert "senha" not in resposta.json()

    novo = Usuario.objects.get(username="joana")
    assert novo.check_password(SENHA_BOA)
    assert novo.get_full_name() == "Joana Silva"
    assert list(novo.groups.values_list("name", flat=True)) == ["gerente"]


def test_login_do_usuario_criado_funciona(admin):
    cliente(admin).post(
        LISTA,
        {"username": "joana", "perfil": "gerente", "senha": SENHA_BOA},
        format="json",
    )
    resposta = APIClient().post(
        "/api/v1/auth/token",
        {"username": "joana", "password": SENHA_BOA},
        format="json",
    )
    assert resposta.status_code == 200


def test_senha_fraca_e_recusada(admin):
    resposta = cliente(admin).post(
        LISTA, {"username": "joana", "perfil": "gerente", "senha": "123456"}, format="json"
    )
    assert resposta.status_code == 400
    assert "senha" in resposta.json()


def test_username_duplicado_e_recusado(admin):
    cria("joana", "gerente")
    resposta = cliente(admin).post(
        LISTA,
        {"username": "JOANA", "perfil": "gerente", "senha": SENHA_BOA},
        format="json",
    )
    assert resposta.status_code == 400


def test_vendedor_exige_codigo(admin):
    resposta = cliente(admin).post(
        LISTA,
        {"username": "carlos", "perfil": "vendedor", "senha": SENHA_BOA},
        format="json",
    )
    assert resposta.status_code == 400
    assert "vendedor_codigo" in resposta.json()


def test_vendedor_vinculado_ao_codigo(admin):
    Vendedor.objects.create(codigo="10", nome="Carlos")
    resposta = cliente(admin).post(
        LISTA,
        {
            "username": "carlos",
            "perfil": "vendedor",
            "senha": SENHA_BOA,
            "vendedor_codigo": "10",
        },
        format="json",
    )
    assert resposta.status_code == 201, resposta.json()
    assert Usuario.objects.get(username="carlos").vendedor.codigo == "10"


def test_codigo_ja_vinculado_e_recusado(admin):
    dono = cria("carlos", "vendedor")
    Vendedor.objects.create(codigo="10", nome="Carlos", usuario=dono)
    resposta = cliente(admin).post(
        LISTA,
        {
            "username": "outro",
            "perfil": "vendedor",
            "senha": SENHA_BOA,
            "vendedor_codigo": "10",
        },
        format="json",
    )
    assert resposta.status_code == 400


def test_trocar_perfil_desfaz_o_vinculo(admin):
    alvo = cria("carlos", "vendedor")
    Vendedor.objects.create(codigo="10", nome="Carlos", usuario=alvo)
    resposta = cliente(admin).patch(
        f"{LISTA}/{alvo.pk}", {"username": "carlos", "perfil": "gerente"}, format="json"
    )
    assert resposta.status_code == 200, resposta.json()
    assert Vendedor.objects.get(codigo="10").usuario is None


def test_desativar_impede_login(admin):
    alvo = cria("joana", "gerente")
    alvo.set_password(SENHA_BOA)
    alvo.save()

    resposta = cliente(admin).patch(
        f"{LISTA}/{alvo.pk}",
        {"username": "joana", "perfil": "gerente", "ativo": False},
        format="json",
    )
    assert resposta.status_code == 200
    assert (
        APIClient()
        .post(
            "/api/v1/auth/token",
            {"username": "joana", "password": SENHA_BOA},
            format="json",
        )
        .status_code
        == 401
    )


def test_remove_usuario(admin):
    alvo = cria("joana", "gerente")
    assert cliente(admin).delete(f"{LISTA}/{alvo.pk}").status_code == 204
    assert not Usuario.objects.filter(pk=alvo.pk).exists()


# --------------------------------------------------------------------------- #
# Reset de senha
# --------------------------------------------------------------------------- #


def test_admin_redefine_senha(admin):
    alvo = cria("joana", "gerente")
    resposta = cliente(admin).post(f"{LISTA}/{alvo.pk}/senha", {"senha": SENHA_BOA}, format="json")
    assert resposta.status_code == 200
    alvo.refresh_from_db()
    assert alvo.check_password(SENHA_BOA)


def test_reset_recusa_senha_fraca(admin):
    alvo = cria("joana", "gerente")
    resposta = cliente(admin).post(f"{LISTA}/{alvo.pk}/senha", {"senha": "abc"}, format="json")
    assert resposta.status_code == 400
    alvo.refresh_from_db()
    assert not alvo.check_password("abc")


@pytest.mark.parametrize("perfil", ["gerente", "vendedor"])
def test_nao_admin_nao_redefine_senha(perfil):
    alvo = cria("joana", "gerente")
    resposta = cliente(cria("outro", perfil)).post(
        f"{LISTA}/{alvo.pk}/senha", {"senha": SENHA_BOA}, format="json"
    )
    assert resposta.status_code == 403
    alvo.refresh_from_db()
    assert not alvo.check_password(SENHA_BOA)


# --------------------------------------------------------------------------- #
# A conta protegida continua intocavel
# --------------------------------------------------------------------------- #


def test_conta_protegida_aparece_marcada(admin, conta_protegida):
    lista = cliente(admin).get(LISTA).json()["usuarios"]
    linha = next(u for u in lista if u["username"] == conta_protegida.username)
    assert linha["protegido"] is True


def test_conta_protegida_nao_e_alterada(admin, conta_protegida):
    resposta = cliente(admin).patch(
        f"{LISTA}/{conta_protegida.pk}",
        {"username": "invadido", "perfil": "vendedor", "ativo": False},
        format="json",
    )
    assert resposta.status_code == 403
    conta_protegida.refresh_from_db()
    assert conta_protegida.username == "admin"
    assert conta_protegida.is_active


def test_conta_protegida_nao_e_removida(admin, conta_protegida):
    assert cliente(admin).delete(f"{LISTA}/{conta_protegida.pk}").status_code == 403
    assert Usuario.objects.filter(pk=conta_protegida.pk).exists()


def test_senha_da_conta_protegida_nao_e_redefinida(admin, conta_protegida):
    resposta = cliente(admin).post(
        f"{LISTA}/{conta_protegida.pk}/senha", {"senha": SENHA_BOA}, format="json"
    )
    assert resposta.status_code == 403
    conta_protegida.refresh_from_db()
    assert not conta_protegida.check_password(SENHA_BOA)


def test_nem_ela_mesma_se_altera(conta_protegida):
    """A conta protegida e admin — e ainda assim nao muda a si propria."""
    resposta = cliente(conta_protegida).patch(
        f"{LISTA}/{conta_protegida.pk}",
        {"username": "admin", "perfil": "admin", "email": "novo@mbc.com.br"},
        format="json",
    )
    assert resposta.status_code == 403


# --------------------------------------------------------------------------- #
# Ninguem se tranca para fora
# --------------------------------------------------------------------------- #


def test_admin_nao_rebaixa_a_si_mesmo(admin):
    resposta = cliente(admin).patch(
        f"{LISTA}/{admin.pk}", {"username": "gestora", "perfil": "gerente"}, format="json"
    )
    assert resposta.status_code == 403
    assert admin.groups.filter(name="admin").exists()


def test_admin_nao_se_desativa(admin):
    resposta = cliente(admin).patch(
        f"{LISTA}/{admin.pk}",
        {"username": "gestora", "perfil": "admin", "ativo": False},
        format="json",
    )
    assert resposta.status_code == 403
    admin.refresh_from_db()
    assert admin.is_active


def test_admin_nao_se_remove(admin):
    assert cliente(admin).delete(f"{LISTA}/{admin.pk}").status_code == 403
    assert Usuario.objects.filter(pk=admin.pk).exists()


def test_admin_edita_o_proprio_nome(admin):
    """A trava e so no perfil e no ativo — o resto continua editavel."""
    resposta = cliente(admin).patch(
        f"{LISTA}/{admin.pk}",
        {"username": "gestora", "perfil": "admin", "nome": "Ana Gestora"},
        format="json",
    )
    assert resposta.status_code == 200, resposta.json()
    admin.refresh_from_db()
    assert admin.get_full_name() == "Ana Gestora"
