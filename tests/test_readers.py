"""Reader contra os CSVs reais, ancorado no baseline de 07/2026.

Estes testes nao precisam de banco. Divergencia aqui significa bug no parsing,
nao mudanca de negocio — os numeros esperados estao documentados em
`data/stack.md` secao 9.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from pathlib import Path

import polars as pl
import pytest

from apps.etl import readers
from apps.etl.readers import ErroLeitura
from apps.etl.schemas import ARQUIVOS

ORIGEM = Path(__file__).resolve().parent.parent / "data" / "dados" / "usarei"

pytestmark = pytest.mark.skipif(
    not (ORIGEM / "SD2.csv").exists(), reason="CSVs do Protheus nao disponiveis"
)


@pytest.fixture(scope="module")
def dados() -> dict[str, pl.DataFrame]:
    return {
        nome: readers.ler(spec, ORIGEM / spec.arquivo)
        for nome, spec in ARQUIVOS.items()
    }


# --------------------------------------------------------------------------- #
# Contagens e totais
# --------------------------------------------------------------------------- #

def test_contagem_de_linhas(dados):
    assert dados["SD2"].height == 38_047
    assert dados["SC5"].height == 35_440
    # 72.333 linhas com Produto, menos 53 de controle da filial.
    assert dados["SB2"].height == 72_280
    assert dados["SD1"].height == 185_297
    # Nenhuma linha do SC6 e descartada: todas tem pedido e produto.
    assert dados["SC6"].height == 57_650


def test_receita_total(dados):
    assert dados["SD2"]["vlr_total"].sum() == Decimal("9760956.86")


def test_custo_da_saida_e_desconto_chegaram(dados):
    """`Custo` e `Desconto` existem no export desde 08/2026.

    O custo e o da LINHA inteira (SKU 114: 91,02 com quantidade 3, 182,04 com 6),
    e o desconto nao esta abatido de Vlr.Total.
    """
    sd2 = dados["SD2"]
    assert sd2["custo_saida"].null_count() == 0
    assert sd2.filter(pl.col("custo_saida") == 0).height == 469
    assert sd2["desconto"].sum() == Decimal("1186557.02")

    # Mesmo SKU, quantidades diferentes, mesmo custo unitario implicito.
    sku114 = sd2.filter(pl.col("produto") == "114").with_columns(
        (pl.col("custo_saida") / pl.col("quantidade")).alias("unit")
    )
    assert sku114["unit"].n_unique() == 1


def test_competencia_unica(dados):
    assert readers.competencias(dados["SD2"]) == [date(2026, 7, 1)]


def test_sd1_cobre_varias_competencias(dados):
    """O SD1 nao acompanha a janela do SD2: 46 competencias contra uma.

    E o que impede usa-lo para estornar devolucao na fase 1 (ver data/stack.md).
    """
    assert len(readers.competencias(dados["SD1"])) == 46
    assert date(2026, 7, 1) in readers.competencias(dados["SD1"])


# --------------------------------------------------------------------------- #
# Parsing: os pontos em que o export do Protheus corrompe dado
# --------------------------------------------------------------------------- #

def test_decimal_com_virgula_vira_decimal(dados):
    sb2 = dados["SB2"]
    assert sb2.schema["vlr_ult_compra"] == pl.Decimal(18, 4)
    # SKU 9: 'ESTICADOR MOLA REBOQUE' com V. Ult. Comp = 65,52
    linha = sb2.filter((pl.col("produto") == "9") & (pl.col("armazem") == "2"))
    assert linha["vlr_ult_compra"].item() == Decimal("65.52")


def test_grupo_recebe_zeros_a_esquerda(dados):
    for arquivo, coluna in (("SB2", "grupo"), ("SD2", "grupo_doc"), ("SD1", "grupo")):
        grupos = set(dados[arquivo][coluna].drop_nulls().unique().to_list())
        # O CSV traz '57' e '128'; o negocio usa '0057' e '0128'.
        assert "0057" in grupos and "0128" in grupos, arquivo
        assert "57" not in grupos and "128" not in grupos, arquivo


def test_produto_preserva_zeros_a_esquerda(dados):
    # Lido como String: inferencia de tipo transformaria em int e perderia o zero.
    assert dados["SD2"].schema["produto"] == pl.String


def test_data_brasileira_vira_date(dados):
    assert dados["SD2"].schema["emissao"] == pl.Date
    assert dados["SC5"].schema["dt_emissao"] == pl.Date


def test_linhas_de_controle_da_filial_descartadas(dados):
    # SB2 traz registros sem Produto (controle da filial) que nao sao itens.
    assert dados["SB2"]["produto"].null_count() == 0
    assert dados["SB2"]["armazem"].null_count() == 0


# --------------------------------------------------------------------------- #
# Colunas ainda pendentes no export (D2_ITEM, CFOP)
# --------------------------------------------------------------------------- #

def test_colunas_opcionais_entram_como_nulas(dados):
    sd2 = dados["SD2"]
    for coluna in ("item", "cfop"):
        assert coluna in sd2.columns, f"{coluna} deveria existir mesmo ausente no CSV"
        assert sd2[coluna].null_count() == sd2.height


def test_saldo_disp_removido_do_export_nao_quebra_a_carga(dados):
    """'Saldo Disp.' virou 'Sld.Atu.' em 08/2026 — o antigo segue opcional."""
    sb2 = dados["SB2"]
    assert sb2["saldo_disp"].null_count() == sb2.height
    assert sb2["sld_atu"].null_count() < sb2.height


def test_complemento_sem_quantidade_nao_reprova_a_validacao(dados):
    """SD1 tem 5.485 notas de complemento com quantidade zero e valor cheio.

    Sao lancamentos legitimos: entram na conferencia aritmetica como divergencia
    de 2,96% e reprovariam um arquivo integro.
    """
    sd1 = dados["SD1"]
    assert sd1.filter(pl.col("quantidade") == 0).height == 5_485
    readers.validar(ARQUIVOS["SD1"], sd1)


def test_duplicatas_preservadas_sem_d2_item(dados):
    """Sem D2_ITEM ha 187 linhas duplicadas byte a byte.

    Sao itens legitimos repetidos na mesma NF. Deduplicar apagaria faturamento —
    por isso a carga do SD2 e por competencia, nao upsert.
    """
    sd2 = dados["SD2"]
    chave = ["filial", "num_docto", "serie", "produto"]
    distintas = sd2.select(chave).unique().height
    assert sd2.height - distintas == 187


# --------------------------------------------------------------------------- #
# SC6 — carteira de pedidos
# --------------------------------------------------------------------------- #

def test_sc6_carteira_em_aberto(dados):
    """O criterio de "em aberto" precisa sobreviver ao parsing.

    Nota fiscal vazia so vira NULL porque o reader normaliza '' -> NULL; se essa
    normalizacao regredir, a carteira passa a ter 57.650 linhas em vez de 1.123.
    """
    sc6 = dados["SC6"]
    assert sc6["vlr_total"].sum() == Decimal("16068412.77")

    sem_nota = sc6.filter(pl.col("nota_fiscal").is_null())
    assert sem_nota.height == 1_047

    em_aberto = sc6.filter(
        pl.col("nota_fiscal").is_null()
        | (pl.col("qtd_entregue").fill_null(0) < pl.col("quantidade"))
    )
    assert em_aberto.height == 1_123


def test_sc6_datas_parseadas(dados):
    sc6 = dados["SC6"]
    assert sc6.schema["dt_entrega"] == pl.Date
    assert sc6.schema["dt_ult_faturamento"] == pl.Date
    assert sc6["dt_entrega"].null_count() == 0


def test_sc6_colunas_quase_vazias_no_export(dados):
    """`Ped Cliente` e `Endereco` chegam sempre vazias; a nota de origem so vem
    preenchida nas 9 linhas de devolucao. Mapeadas para o dia que o Protheus
    passar a preencher o resto."""
    sc6 = dados["SC6"]
    for coluna in ("ped_cliente", "endereco"):
        assert sc6[coluna].null_count() == sc6.height, coluna
    for coluna in ("nf_original", "serie_origem"):
        assert sc6[coluna].null_count() == 57_641, coluna


# --------------------------------------------------------------------------- #
# Falhas que devem abortar a carga
# --------------------------------------------------------------------------- #

def test_coluna_obrigatoria_ausente_aborta(tmp_path):
    arquivo = tmp_path / "SD2.csv"
    arquivo.write_text(
        "SD2;;\n\nFilial;Produto;Quantidade\n101;1;2\n", encoding="latin-1"
    )
    with pytest.raises(ErroLeitura, match="colunas obrigatorias ausentes"):
        readers.ler(ARQUIVOS["SD2"], arquivo)


def test_arquivo_inexistente_aborta(tmp_path):
    with pytest.raises(ErroLeitura, match="arquivo nao encontrado"):
        readers.ler(ARQUIVOS["SD2"], tmp_path / "nao_existe.csv")


def test_total_divergente_aborta(tmp_path):
    cabecalho = (
        "SD2;;;;;;;;;;;;;;;;;\n\n"
        "Filial;Produto;Unidade;Quantidade;Vlr.Unitario;Vlr.Total;No do Pedido;"
        "Cliente;Loja;Armazem;Num. Docto.;Serie;Emissao;Número PDV;Desc.Item;"
        "Custo;Tipo Saida;Grupo;Desconto\n"
    )
    # Vlr.Total nao bate com Quantidade x Vlr.Unitario em todas as linhas.
    linhas = "".join(
        f"101;{i};PC;2;10;999;500{i};1;1;2;900{i};1;15/07/2026;;;15;600;128;0\n"
        for i in range(50)
    )
    arquivo = tmp_path / "SD2.csv"
    arquivo.write_text(cabecalho + linhas, encoding="latin-1")

    df = readers.ler(ARQUIVOS["SD2"], arquivo)
    with pytest.raises(ErroLeitura, match="Vlr.Total divergente"):
        readers.validar(ARQUIVOS["SD2"], df)


def test_arquivo_valido_passa_na_validacao(dados):
    for nome, spec in ARQUIVOS.items():
        readers.validar(spec, dados[nome])
