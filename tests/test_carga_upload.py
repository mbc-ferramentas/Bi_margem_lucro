"""Upload dos CSVs pelo administrador.

A carga e o unico caminho de escrita exposto na API. Dois riscos justificam estes
testes: um perfil sem alcada disparar uma carga (reescreve a margem de um mes
para todo mundo) e um arquivo invalido entrar pela metade.
"""

from __future__ import annotations

import pytest
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.core.models import ExecucaoCarga, Usuario
from tests.helpers import ORIGEM, escalar, sem_csv

pytestmark = pytest.mark.django_db

ROTA = "/api/v1/carga"


def cliente_de(grupo: str | None = None, superuser: bool = False) -> APIClient:
    usuario = Usuario.objects.create_user(
        username=f"u-{grupo}-{superuser}", password="x", is_superuser=superuser
    )
    if grupo:
        usuario.groups.add(Group.objects.get(name=grupo))
    c = APIClient()
    c.force_authenticate(user=usuario)
    return c


def upload(nome: str) -> SimpleUploadedFile:
    return SimpleUploadedFile(
        f"{nome}.csv", (ORIGEM / f"{nome}.csv").read_bytes(), content_type="text/csv"
    )


# --------------------------------------------------------------------------- #
# Permissao
# --------------------------------------------------------------------------- #


def test_anonimo_recebe_401():
    assert APIClient().post(ROTA, {}, format="multipart").status_code == 401


@pytest.mark.parametrize("grupo", ["gerente", "vendedor"])
def test_perfil_sem_alcada_recebe_403(grupo):
    resposta = cliente_de(grupo).post(ROTA, {}, format="multipart")
    assert resposta.status_code == 403


def test_superuser_e_tratado_como_admin():
    # Sem arquivo o pedido e invalido (400), mas passou pela permissao — que e o
    # que este teste verifica. 403 aqui significaria regressao no `perfis()`.
    resposta = cliente_de(superuser=True).post(ROTA, {}, format="multipart")
    assert resposta.status_code == 400


# --------------------------------------------------------------------------- #
# Validacao da requisicao
# --------------------------------------------------------------------------- #


def test_sem_arquivo_recebe_400():
    resposta = cliente_de("admin").post(ROTA, {}, format="multipart")
    assert resposta.status_code == 400
    assert "ao menos um arquivo" in str(resposta.data)


def test_campo_desconhecido_recebe_400():
    arquivo = SimpleUploadedFile("x.csv", b"a;b\n1;2\n", content_type="text/csv")
    resposta = cliente_de("admin").post(ROTA, {"SB9": arquivo}, format="multipart")
    assert resposta.status_code == 400
    assert "nao reconhecido" in str(resposta.data)


def test_arquivo_invalido_nao_grava_nada():
    """Coluna obrigatoria ausente aborta antes de qualquer escrita."""
    conteudo = "SD2;;\n\nFilial;Produto;Quantidade\n101;1;2\n".encode("latin-1")
    arquivo = SimpleUploadedFile("SD2.csv", conteudo, content_type="text/csv")
    antes = escalar("SELECT count(*) FROM stg_sd2")

    resposta = cliente_de("admin").post(ROTA, {"SD2": arquivo}, format="multipart")

    assert resposta.status_code == 400
    assert escalar("SELECT count(*) FROM stg_sd2") == antes
    # A falha fica auditada, nao so na resposta de quem disparou.
    registro = ExecucaoCarga.objects.filter(arquivo="SD2").latest("criado_em")
    assert registro.status == ExecucaoCarga.Status.ERRO


# --------------------------------------------------------------------------- #
# Caminho feliz, contra os CSVs reais
# --------------------------------------------------------------------------- #


@sem_csv
def test_upload_carrega_e_audita():
    antes = ExecucaoCarga.objects.filter(status="sucesso").count()
    resposta = cliente_de("admin").post(
        ROTA,
        {
            "SB2": upload("SB2"),
            "SC5": upload("SC5"),
            "SC6": upload("SC6"),
            "SD1": upload("SD1"),
            "SD2": upload("SD2"),
        },
        format="multipart",
    )

    assert resposta.status_code == 200
    resumo = {a["arquivo"]: a for a in resposta.data["arquivos"]}
    assert set(resumo) == {"SB2", "SC5", "SC6", "SD1", "SD2"}
    assert all(a["status"] == "sucesso" for a in resumo.values())
    assert resumo["SD1"]["linhas_lidas"] == 185_297
    assert resumo["SD1"]["linhas_gravadas"] == 185_297
    assert resumo["SC6"]["linhas_lidas"] == 57_650
    assert resumo["SD2"]["linhas_lidas"] == 38_047
    assert resumo["SD2"]["linhas_gravadas"] == 38_047

    # A carga substitui a competencia inteira, entao reenviar nao duplica linha.
    assert escalar("SELECT count(*) FROM stg_sd2") == 38_047
    assert ExecucaoCarga.objects.filter(status="sucesso").count() == antes + 5


@sem_csv
def test_ordem_de_processamento_independe_do_envio():
    """SB2 primeiro sempre: a margem depende do snapshot de custo do periodo."""
    resposta = cliente_de("admin").post(
        ROTA, {"SD2": upload("SD2"), "SB2": upload("SB2")}, format="multipart"
    )
    assert resposta.status_code == 200
    assert [a["arquivo"] for a in resposta.data["arquivos"]] == ["SB2", "SD2"]


@sem_csv
def test_csv_nao_sobrevive_a_requisicao(tmp_path, settings):
    """O CSV enviado e descartado; o historico auditavel e o Parquet."""
    settings.DIR_STAGING_PARQUET = tmp_path / "staging"

    resposta = cliente_de("admin").post(ROTA, {"SC5": upload("SC5")}, format="multipart")

    assert resposta.status_code == 200
    assert not list(tmp_path.glob("**/SC5.csv"))
    assert list((tmp_path / "staging" / "sc5").glob("**/*.parquet"))
