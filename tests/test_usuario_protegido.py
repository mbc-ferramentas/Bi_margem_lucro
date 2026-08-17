"""Conta administrativa protegida.

A conta `admin` e a saida de emergencia: se alguem errar as permissoes ou se
trancar para fora, ela continua entrando. Por isso e imutavel pela aplicacao —
inclusive para superusuarios — e so muda por acesso direto ao banco.
"""

import pytest
from django.contrib.admin.sites import AdminSite
from django.core.exceptions import PermissionDenied, ValidationError
from django.test import RequestFactory

from apps.core.admin import UsuarioAdmin
from apps.core.models import Usuario

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_site():
    return UsuarioAdmin(Usuario, AdminSite())


@pytest.fixture
def conta_admin():
    return Usuario.objects.get(username="admin")


@pytest.fixture
def superusuario():
    return Usuario.objects.create_superuser(username="outro_super", password="x")


def requisicao(usuario):
    pedido = RequestFactory().get("/admin/")
    pedido.user = usuario
    return pedido


# --------------------------------------------------------------------------- #
# A conta existe e funciona
# --------------------------------------------------------------------------- #


def test_conta_admin_criada_pela_migration(conta_admin):
    assert conta_admin.is_superuser
    assert conta_admin.is_staff
    assert conta_admin.is_active
    assert conta_admin.protegido


def test_senha_inicial_funciona(conta_admin):
    assert conta_admin.check_password("MBCTI123")


def test_pertence_ao_grupo_admin(conta_admin):
    assert conta_admin.groups.filter(name="admin").exists()


# --------------------------------------------------------------------------- #
# Imutavel pela interface
# --------------------------------------------------------------------------- #


def test_superusuario_nao_pode_alterar(admin_site, conta_admin, superusuario):
    assert admin_site.has_change_permission(requisicao(superusuario), conta_admin) is False


def test_superusuario_nao_pode_remover(admin_site, conta_admin, superusuario):
    assert admin_site.has_delete_permission(requisicao(superusuario), conta_admin) is False


def test_a_propria_conta_tambem_nao_se_altera(admin_site, conta_admin):
    """Nem o proprio admin muda a si mesmo pela interface — so pelo banco."""
    assert admin_site.has_change_permission(requisicao(conta_admin), conta_admin) is False


def test_usuario_comum_continua_editavel(admin_site, superusuario):
    """A protecao vale so para contas marcadas, nao para o cadastro em geral."""
    comum = Usuario.objects.create_user(username="comum", password="x")
    pedido = requisicao(superusuario)
    assert admin_site.has_change_permission(pedido, comum) is True
    assert admin_site.has_delete_permission(pedido, comum) is True


def test_acao_em_massa_nao_remove_protegido(admin_site, conta_admin, superusuario):
    """A acao 'excluir selecionados' nao checa objeto a objeto — barreira propria."""
    with pytest.raises(PermissionDenied, match="admin"):
        admin_site.delete_queryset(
            requisicao(superusuario), Usuario.objects.filter(username="admin")
        )
    assert Usuario.objects.filter(username="admin").exists()


def test_flag_protegido_e_somente_leitura(admin_site):
    """Ninguem desmarca a protecao pela tela para depois editar."""
    assert "protegido" in admin_site.readonly_fields


# --------------------------------------------------------------------------- #
# Barreira tambem no ORM
# --------------------------------------------------------------------------- #


def test_delete_pelo_orm_e_bloqueado(conta_admin):
    """Um script ou `manage.py shell` tambem nao remove a conta."""
    with pytest.raises(ValidationError):
        conta_admin.delete()
    assert Usuario.objects.filter(username="admin").exists()


def test_migration_e_idempotente_e_nao_sobrescreve_senha(conta_admin):
    """Trocar a senha no banco nao pode ser desfeito no proximo `migrate`."""
    import importlib

    from django.apps import apps as apps_reais

    conta_admin.set_password("senha-trocada-no-banco")
    conta_admin.save()

    migracao = importlib.import_module("apps.core.migrations.0007_usuario_admin")
    migracao.criar(apps_reais, None)

    conta_admin.refresh_from_db()
    assert conta_admin.check_password("senha-trocada-no-banco")
    assert conta_admin.protegido
