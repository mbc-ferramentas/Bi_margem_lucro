import pytest
from django.core.management import call_command

from tests.helpers import ORIGEM


@pytest.fixture(scope="session")
def carga(django_db_setup, django_db_blocker):
    """Carrega os CSVs reais uma vez por sessao de testes."""
    with django_db_blocker.unblock():
        call_command("carregar_protheus", origem=ORIGEM, verbosity=0)
        yield
