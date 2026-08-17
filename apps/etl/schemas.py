"""Contrato de leitura dos arquivos exportados do Protheus.

Os quatro arquivos compartilham o mesmo formato de exportacao:

- separador ';'
- encoding latin-1 ('Descricao' vem como 'Descri\\xe7\\xe3o')
- decimal com virgula ('65,52')
- duas linhas de lixo antes do cabecalho real ('SB2;;;;' + linha em branco)

Colunas marcadas como opcionais ainda nao existem no export atual. O reader as
ignora quando ausentes, de modo que o dia em que o TI incluir esses campos o
pipeline passa a aproveita-los sem alteracao de codigo.
"""

from dataclasses import dataclass, field

ENCODING = "latin-1"
SEPARADOR = ";"
LINHAS_LIXO = 2  # 'SB2;;;;' + linha em branco


@dataclass(frozen=True)
class ArquivoProtheus:
    nome: str
    arquivo: str
    tabela: str
    # cabecalho original do CSV -> nome da coluna no banco
    colunas: dict[str, str]
    numericas: tuple[str, ...] = ()
    datas: tuple[str, ...] = ()
    # colunas que, se vazias, invalidam a linha
    obrigatorias: tuple[str, ...] = ()
    # chave natural usada para deduplicar e para o upsert (quando houver)
    chave: tuple[str, ...] = field(default_factory=tuple)
    # colunas ainda ausentes no export atual — nao falhar quando faltarem
    opcionais: tuple[str, ...] = ()
    # coluna de data que define a competencia (particao da carga)
    coluna_competencia: str | None = None


SB2 = ArquivoProtheus(
    nome="SB2",
    arquivo="SB2.csv",
    tabela="stg_sb2",
    colunas={
        "Filial": "filial",
        "Produto": "produto",
        "Armazem": "armazem",
        "Descrição": "descricao",
        "V. Ult. Comp": "vlr_ult_compra",
        "Saldo Atual": "saldo_atual",
        # Sld.Atu. substituiu 'Saldo Disp.' no export de 08/2026. O antigo continua
        # mapeado como opcional para que arquivos ja baixados nao quebrem a carga.
        "Sld.Atu.": "sld_atu",
        "Saldo Disp.": "saldo_disp",
        "C Unitario": "custo_unitario",
        "Grupo": "grupo",
    },
    numericas=("vlr_ult_compra", "saldo_disp", "saldo_atual", "sld_atu", "custo_unitario"),
    # Linhas sem Produto sao registros de controle da filial, nao itens de estoque.
    obrigatorias=("produto", "armazem"),
    chave=("filial", "produto", "armazem"),
    opcionais=("saldo_disp", "sld_atu"),
)

SC5 = ArquivoProtheus(
    nome="SC5",
    arquivo="SC5.csv",
    tabela="stg_sc5",
    colunas={
        "Numero": "numero",
        "Cliente": "cliente",
        "Loja": "loja",
        "Nome Cli/For": "nome_cliente",
        "DT Emissao": "dt_emissao",
        # Identifica o marketplace de origem. Precisa sair do Protheus como TEXTO:
        # exportado via Excel, IDs numericos longos viram '2,00E+15' e o dado se perde.
        "Num Ped Clie": "num_ped_cliente",
        "Vendedor 1": "vendedor",
        "Nome Vend.": "nome_vendedor",
        "Nota Fiscal": "nota_fiscal",
        "Serie": "serie",
    },
    datas=("dt_emissao",),
    obrigatorias=("numero",),
    chave=("numero",),
)

SD2 = ArquivoProtheus(
    nome="SD2",
    arquivo="SD2.csv",
    tabela="stg_sd2",
    colunas={
        "Filial": "filial",
        "Produto": "produto",
        "Unidade": "unidade",
        "Quantidade": "quantidade",
        "Vlr.Unitario": "vlr_unitario",
        "Vlr.Total": "vlr_total",
        "No do Pedido": "num_pedido",
        "Cliente": "cliente",
        "Loja": "loja",
        "Armazem": "armazem",
        "Num. Docto.": "num_docto",
        "Serie": "serie",
        "Emissao": "emissao",
        "Número PDV": "numero_pdv",
        "Desc.Item": "desc_item",
        # --- chegaram no export de 08/2026 ---
        # Custo total da LINHA (nao unitario): SKU 114 sai 91,02 com quantidade 3 e
        # 182,04 com quantidade 6. E o D2_CUSTO1 — custo congelado no faturamento,
        # topo da cascata da Regra 3. A divisao por quantidade e feita na view.
        "Custo": "custo_saida",
        # D2_TES. Separa venda de remessa/bonificacao. Nenhum codigo e descartado
        # aqui: a classificacao vive em core_mapates, editavel pelo negocio.
        "Tipo Saida": "tes",
        # Grupo na propria linha faturada, mais fiel que o cadastro atual do SB2.
        "Grupo": "grupo_doc",
        # Desconto concedido, NAO abatido de Vlr.Total (que continua = Qtd x Unit).
        "Desconto": "desconto",
        # --- ainda pendentes (ver data/stack.md secao 10) ---
        "Item": "item",   # D2_ITEM — destrava a carga incremental
        "CFOP": "cfop",   # D2_CF
    },
    numericas=("quantidade", "vlr_unitario", "vlr_total", "custo_saida", "desconto"),
    datas=("emissao",),
    obrigatorias=("produto",),
    # Sem D2_ITEM nao ha chave unica: no arquivo de 07/2026 ha 187 linhas duplicadas
    # byte a byte, que sao itens legitimos repetidos na mesma NF. Por isso a carga e
    # por competencia (substitui o mes inteiro) ate o campo existir.
    chave=("filial", "num_docto", "serie", "item"),
    opcionais=("item", "cfop"),
    coluna_competencia="emissao",
)

# SD1 — itens de nota de ENTRADA (compras, devolucoes de cliente, complementos).
# Fase 1 nao usa: o export atual cobre 2025 inteiro enquanto o SD2 e de 07/2026, e
# sem sobreposicao de periodo nao ha o que estornar. Entra no staging para que o
# historico de compras e as devolucoes ja estejam la quando a fase 2 comecar.
SD1 = ArquivoProtheus(
    nome="SD1",
    arquivo="SD1.csv",
    tabela="stg_sd1",
    colunas={
        "Filial": "filial",
        "Item NF": "item_nf",
        "Produto": "produto",
        "Desc.produto": "desc_produto",
        "Unidade": "unidade",
        "Quantidade": "quantidade",
        "Vlr.Unitario": "vlr_unitario",
        "Vlr.Total": "vlr_total",
        "No do Pedido": "num_pedido",
        "Item do Ped.": "item_pedido",
        "Forn/Cliente": "forn_cliente",
        "Loja": "loja",
        "Documento": "documento",
        "DT Emissao": "dt_emissao",
        "DT Digitacao": "dt_digitacao",
        "Serie": "serie",
        "Desc.Item": "desc_item",
        "Armazem": "armazem",
        "Grupo": "grupo",
        # 'N' entrada normal, 'D' devolucao, 'C' complemento, 'B' beneficiamento.
        "Tipo Docto.": "tipo_docto",
        "Custo Moeda1": "custo_moeda1",
        "Docto. Orig.": "docto_origem",
        "Serie Orig.": "serie_origem",
        "Desconto": "desconto",
        "TES Selecion": "tes",
    },
    numericas=("quantidade", "vlr_unitario", "vlr_total", "custo_moeda1", "desconto"),
    datas=("dt_emissao", "dt_digitacao"),
    obrigatorias=("produto",),
    # (filial, documento, serie, item_nf) NAO e unica: sao 183.566 combinacoes para
    # 185.297 linhas no arquivo de 2025, e `serie` vem vazia em parte delas.
    # Deduplicar apagaria linha legitima, entao a carga e por competencia, como no SD2.
    chave=(),
    coluna_competencia="dt_emissao",
)

ARQUIVOS: dict[str, ArquivoProtheus] = {a.nome: a for a in (SB2, SC5, SD1, SD2)}
