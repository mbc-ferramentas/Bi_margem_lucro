"""Redefine a senha da conta administrativa protegida."""

from django.db import migrations

USERNAME = "admin"
NOVA_SENHA = "MBCTI123."


def redefinir_senha(apps, schema_editor):
    from django.contrib.auth.hashers import make_password

    Usuario = apps.get_model("core", "Usuario")
    Usuario.objects.filter(username=USERNAME).update(
        password=make_password(NOVA_SENHA),
        is_superuser=True,
        is_staff=True,
        is_active=True,
        protegido=True,
    )


class Migration(migrations.Migration):
    dependencies = [("core", "0008_layout_08_2026")]
    operations = [migrations.RunPython(redefinir_senha, migrations.RunPython.noop)]
