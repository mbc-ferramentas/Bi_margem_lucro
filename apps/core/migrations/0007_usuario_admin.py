"""Conta administrativa protegida.

Cria o usuario `admin` como superusuario protegido: visivel no Admin, porem
imutavel pela interface — alterar ou remover exige acesso direto ao banco.

A senha vem de `ADMIN_SENHA_INICIAL`, com um padrao para o ambiente de
desenvolvimento. **Em producao, defina a variavel no `.env`**: uma senha padrao
versionada no repositorio da acesso ao BI a qualquer pessoa com acesso ao codigo.

A migration e idempotente: se a conta ja existir, nao sobrescreve a senha — assim
uma troca feita direto no banco nao e desfeita no proximo `migrate`.
"""

from django.db import migrations

USERNAME = "admin"


def criar(apps, schema_editor):
    from decouple import config
    from django.contrib.auth.hashers import make_password

    Usuario = apps.get_model("core", "Usuario")
    Group = apps.get_model("auth", "Group")

    if Usuario.objects.filter(username=USERNAME).exists():
        # Ja existe: apenas garante que segue protegida e com acesso total.
        Usuario.objects.filter(username=USERNAME).update(
            is_superuser=True, is_staff=True, is_active=True, protegido=True
        )
        return

    usuario = Usuario.objects.create(
        username=USERNAME,
        password=make_password(config("ADMIN_SENHA_INICIAL", default="mbcti123")),
        first_name="Administrador",
        email="",
        is_superuser=True,
        is_staff=True,
        is_active=True,
        protegido=True,
    )

    grupo = Group.objects.filter(name="admin").first()
    if grupo:
        usuario.groups.add(grupo)


def remover(apps, schema_editor):
    # O update tira a protecao antes do delete: o reverso da migration e a unica
    # via legitima de remocao pela aplicacao.
    Usuario = apps.get_model("core", "Usuario")
    Usuario.objects.filter(username=USERNAME).update(protegido=False)
    Usuario.objects.filter(username=USERNAME).delete()


class Migration(migrations.Migration):
    dependencies = [("core", "0006_usuario_protegido")]
    operations = [migrations.RunPython(criar, remover)]
