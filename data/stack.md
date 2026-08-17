# Stack — BI de Margem de Lucro

Documento de decisão técnica. Define escopo, regras de negócio, banco, backend,
pipeline de dados, frontend e o esqueleto de carregamento dos arquivos do Protheus.

---

## 0. Escopo

### Fase 1 — Lucro bruto (atual)

```
margem bruta = receita − (quantidade × custo unitário congelado)
```

Fora do escopo: impostos, frete, comissão de marketplace, custo financeiro e
devoluções. O indicador é **margem de contribuição bruta** e a interface precisa
rotulá-lo assim, sem eufemismo.

**Restrição de leitura que decorre disso:** o canal Lexos (marketplace) tem 12-19% de
comissão que não está lançada em lugar nenhum; a venda interna não tem custo
equivalente. Comparar os dois lado a lado é inválido — na medição de 07/2026 o Lexos
aparece com 20,1% de margem bruta, mas com comissão cairia para algo entre 1% e 8%.

Por isso, na fase 1:

- **não existe tela de comparação entre canais**;
- onde o canal Lexos aparecer, o rótulo diz *"margem bruta — não inclui comissão de
  marketplace"*;
- as análises válidas são **dentro** de cada canal: ranking de SKU, de vendedor
  interno, evolução mensal, giro × margem.

### Fase 2 — Lucro líquido (posterior)

Entra comissão por marketplace, impostos (ICMS/ST, IPI, PIS/COFINS), frete e seguro,
devoluções (SD1/SF1) e custo financeiro do prazo. Só então a comparação entre canais
passa a fazer sentido.

---

## 0.1 Regras de negócio decididas

| # | Regra | Status |
|---|---|---|
| 1 | **Canal ≠ vendedor.** Vendedor 72 "VENDAS LEXOS" é o integrador de marketplace (Amazon, Magalu, Shopee, Mercado Livre), não uma pessoa — 94% dos pedidos e 68,5% da receita. Canal (`Marketplace` / `Venda interna` / `Balcão-PDV`) e vendedor são dimensões separadas; ranking de rentabilidade por vendedor só dentro de "Venda interna". O armazém **não** serve para segmentar canal: 97,9% da receita está no armazém 02. | Decidida |
| 2 | **Quarentena de outlier de custo.** Linhas com margem muito negativa são erro de cadastro, não prejuízo (ex.: SKU 60186 com custo 1.449,75 no armazém 02 e 147,91 no 13, vendido a 150,00 — distorce a margem global em ~2 p.p. sozinho). | **Em aberto** — definir o corte |
| 3 | **Cascata de custo:** `D2_CUSTO1` (custo congelado na saída) → `C Unitario` → `V. Ult. Comp` → custo do mesmo produto em outro armazém → `sem_custo` (fora do KPI, identificável pela flag em `mv_margem_item`). | Decidida |
| 4 | **Grupo vazio = `(sem classificação)`**, categoria explícita e visível em todos os cortes — 11,5% da receita. Reclassificação por SKU via Django Admin. Nunca somar silenciosamente no Agrícola. | Decidida |
| 5 | **Pedido do SD2 ausente no SC5** aparece como `(pedido sem cadastro)` e nunca some do faturamento. Causa provável: SC5 exportado por data de emissão do pedido e SD2 por data da nota. Pedir SC5 com janela ~90 dias maior. | Decidida |
| 6 | **Devolução por competência** (estorna no mês da venda original), com a tela exibindo a data do último recálculo. | Fase 2 |

---

## 1. Visão geral

| Camada | Escolha |
|---|---|
| Banco | PostgreSQL 18 |
| Backend / Admin / Auth | Django 5 + Django REST Framework |
| Gerenciador de pacotes | uv |
| ETL | Polars |
| Camada de staging / cache analítico | Parquet |
| Agendamento | Celery + Redis (Celery Beat) |
| Frontend | React + Vite + TypeScript, TanStack Query, ECharts, shadcn/ui |
| Deploy | Docker Compose |

Princípio que orienta todo o desenho: **leitura analítica em SQL puro, cadastro em ORM.**
As agregações de margem nunca passam pelo ORM do Django — são materialized views no
Postgres. O ORM existe para os models de cadastro (usuários, regras de custo, comissão
por armazém, mapeamento de grupo), que é onde o Django Admin paga o próprio custo.

---

## 2. PostgreSQL 18

Banco único, transacional e analítico. O volume atual (~145 mil linhas, ~10 MB) está
muito abaixo do ponto em que faria sentido separar OLTP de OLAP.

Recursos da versão 18 que o projeto usa:

- **`uuidv7()` nativo** — chaves primárias ordenadas por tempo nas tabelas de fato,
  sem extensão externa. Melhor localidade de índice que `uuid4` em inserts em lote.
- **I/O assíncrono (`io_method = worker`)** — ganho direto nos scans sequenciais das
  materialized views de margem.
- **Skip scan em índices B-tree multicoluna** — consultas que filtram só por armazém
  ou só por período aproveitam o índice composto `(filial, produto, armazem)` sem
  precisar de índices adicionais.
- **`RETURNING` com `OLD`/`NEW`** — simplifica a auditoria de alterações nas tabelas
  de regra de negócio.
- **Estatísticas preservadas no `pg_upgrade`** — sem janela de performance degradada
  após upgrade.

### Configuração mínima (`postgresql.conf`)

```conf
shared_buffers = 2GB
work_mem = 64MB                  # agregações de margem
maintenance_work_mem = 512MB     # REFRESH MATERIALIZED VIEW
effective_cache_size = 6GB
io_method = worker               # novidade do PG18
io_workers = 3
max_parallel_workers_per_gather = 4
```

### Extensões

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- busca por descrição de produto
```

---

## 3. Django

Responsabilidades:

1. **Auth e RBAC** — `django.contrib.auth` com grupos: `admin`, `gerente`, `vendedor`.
   Vendedor enxerga apenas os próprios pedidos (filtro por `vendedor_codigo` no
   queryset base da API).
2. **Django Admin** — telas prontas para as tabelas de regra de negócio, que mudam
   com frequência durante a validação do cálculo de margem:
   - `RegraCusto` — fallback quando `V. Ult. Comp` vem zerado
   - `ComissaoCanal` — percentual por armazém (13 = Full Mercado Livre)
   - `MapaArmazem`, `MapaGrupo` — rótulos de negócio
3. **DRF** — endpoints de leitura que executam SQL puro contra as materialized views.

O que o Django **não** faz: agregação analítica. Nenhum `annotate()` / `aggregate()`
nos endpoints de dashboard.

---

## 4. uv

Gerenciador de pacotes e de versão do Python. Substitui pip, venv, pip-tools e pyenv.
Escolhido por resolver o lock em segundos e por manter `uv.lock` reprodutível entre
a máquina do dev e a imagem Docker.

```bash
uv init
uv add django djangorestframework psycopg[binary] polars pyarrow celery redis \
       python-decouple django-cors-headers
uv add --dev pytest pytest-django ruff mypy

uv run python manage.py migrate
uv run python manage.py runserver
```

No Dockerfile: `uv sync --frozen --no-dev`.

---

## 5. Polars + Parquet

### Por que Polars

Os CSVs do Protheus são sujos de um jeito específico e repetitivo:

- separador `;`
- encoding **latin-1** (`Descrição` vem como `Descri\xe7\xe3o`)
- decimal com **vírgula** (`65,52`)
- duas linhas de lixo antes do cabeçalho real (`SB2;;;;` e linha vazia)
- `Num Ped Clie` em notação científica (`2,00E+15`) — tratar sempre como texto
- linhas com `Produto` vazio no SB2 (registros de controle da filial)

Polars faz esse parsing de forma declarativa, com execução lazy e paralela, e o mesmo
código serve para 40 mil ou 40 milhões de linhas.

### Por que Parquet

Camada intermediária entre o CSV bruto e o Postgres:

```
CSV (latin-1, sujo)  →  Parquet (tipado, comprimido, particionado)  →  Postgres
                              ↑
                        histórico versionado por data de carga
```

Ganhos:

- **Re-processamento sem reler CSV.** Mudou a regra de margem? Recarrega do Parquet.
- **Tipos preservados** — `Decimal(18,4)` para valores monetários, sem perda de
  precisão em ponto flutuante.
- **Compressão ~10x** em relação ao CSV, com leitura por coluna.
- **Histórico** — cada execução grava em `staging/dt_carga=YYYY-MM-DD/`, permitindo
  auditar de onde veio um número que o usuário questiona.
- **Consulta ad-hoc direta** com Polars ou DuckDB, sem passar pelo banco.

Layout em disco:

```
data/
├── dados/usarei/          # CSVs originais do Protheus (entrada)
│   ├── SB2.csv
│   ├── SC5.csv
│   └── SD2.csv
├── staging/               # Parquet tipado, particionado por data de carga
│   ├── sb2/dt_carga=2026-08-03/part-0.parquet
│   ├── sc5/dt_carga=2026-08-03/part-0.parquet
│   └── sd2/dt_carga=2026-08-03/part-0.parquet
└── stack.md
```

---

## 6. Frontend

```
React 19 + Vite + TypeScript
├── TanStack Query      cache e revalidação dos endpoints agregados
├── TanStack Table      grid de itens com ordenação/virtualização
├── ECharts             gráficos (margem por vendedor, evolução mensal, treemap SKU)
├── shadcn/ui + Tailwind  componentes e filtros
└── Zod                 validação dos payloads da API
```

Telas previstas:

| Tela | Conteúdo |
|---|---|
| Visão geral | Receita, custo, margem R$ e %, ticket médio — com filtro de período |
| Por vendedor | Ranking de rentabilidade, margem média, mix de produtos |
| Por SKU | Itens mais e menos rentáveis, giro vs. margem |
| Por canal | Comparativo Loja (01) × Ecommerce/Agrícola (02) × Full ML (13) |
| Uploads | Envio dos CSVs do Protheus (SB2/SC5/SD2), só para administrador |

Houve uma tela de Qualidade de dado, removida a pedido do cliente, junto com o
bloco `excluidas` que `/api/v1/kpis` devolvia. A lógica que ela reportava
continua ativa: linhas sem custo e outliers de custo ficam fora do KPI. Para
auditar, consulte as flags direto em `mv_margem_item`.

---

## 7. Modelo de dados

### Tabelas de staging (espelho do Protheus, carga full a cada execução)

```sql
CREATE TABLE stg_sb2 (
    filial        text    NOT NULL,
    produto       text    NOT NULL,
    armazem       text    NOT NULL,
    descricao     text,
    vlr_ult_compra numeric(18,4),
    saldo_disp    numeric(18,4),
    saldo_atual   numeric(18,4),
    custo_unitario numeric(18,4),
    grupo         text,
    dt_carga      date    NOT NULL,
    PRIMARY KEY (filial, produto, armazem)
);

CREATE TABLE stg_sc5 (
    numero        text    NOT NULL PRIMARY KEY,
    cliente       text,
    loja          text,
    nome_cliente  text,
    dt_emissao    date,
    num_ped_cliente text,
    vendedor      text,
    nome_vendedor text,
    dt_carga      date    NOT NULL
);

CREATE TABLE stg_sd2 (
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    filial        text NOT NULL,
    num_docto     text NOT NULL,
    serie         text NOT NULL,
    item          text NOT NULL,      -- D2_ITEM: indispensavel para carga incremental
    produto       text NOT NULL,
    unidade       text,
    quantidade    numeric(18,4),
    vlr_unitario  numeric(18,4),
    vlr_total     numeric(18,4),
    custo_saida   numeric(18,4),      -- D2_CUSTO1: custo congelado no faturamento
    cfop          text,               -- D2_CF  } separa venda real de remessa,
    tes           text,               -- D2_TES } bonificacao, amostra, consignacao
    num_pedido    text,
    cliente       text,
    armazem       text,
    emissao       date,
    numero_pdv    text,
    dt_carga      date NOT NULL,
    CONSTRAINT uq_sd2 UNIQUE (filial, num_docto, serie, item)
);

CREATE INDEX idx_sd2_produto  ON stg_sd2 (filial, produto, armazem);
CREATE INDEX idx_sd2_pedido   ON stg_sd2 (num_pedido);
CREATE INDEX idx_sd2_emissao  ON stg_sd2 (emissao);
```

> **`item` (D2_ITEM) é o que viabiliza a carga incremental.** Sem ele o SD2 não tem
> chave única: no arquivo de 07/2026 há 187 linhas duplicadas byte a byte
> (mesmo produto, nota, quantidade e valor) — são itens repetidos na mesma NF,
> legítimos no Protheus e distinguidos apenas por `D2_ITEM`. Sem esse campo, ou se
> recarrega tudo a cada execução (não escala), ou se duplica faturamento.

> **`custo_saida` (D2_CUSTO1) é o que estabiliza o histórico.** O SB2 é uma fotografia
> do momento; recarregá-lo mensalmente e recalcular a margem passada com o custo atual
> faz os números de meses fechados mudarem sozinhos. Com o custo congelado no
> faturamento, o passado fica imutável por construção.

> **Atenção no join SD2 → SC5:** o SC5 tem mais de uma linha por pedido (uma por nota
> fiscal). Aplicar `DISTINCT ON (numero)` antes do join, senão a receita duplica.
> E usar `LEFT JOIN`: linhas de PDV/balcão vêm com `num_pedido` vazio e devem aparecer
> como vendedor "BALCÃO/PDV", não sumir do relatório.

### Materialized view de margem

```sql
CREATE MATERIALIZED VIEW mv_margem_item AS
WITH pedidos AS (
    -- SC5 pode ter mais de uma linha por pedido (uma por nota fiscal)
    SELECT DISTINCT ON (numero) numero, vendedor, nome_vendedor, cliente, nome_cliente
    FROM stg_sc5
    ORDER BY numero
),
base AS (
    SELECT
        d.id,
        d.filial,
        d.produto                   AS sku,
        b.descricao,
        COALESCE(NULLIF(b.grupo, ''), '(sem classificacao)') AS grupo,
        d.armazem,
        d.emissao,
        d.num_pedido,
        -- Regra 1: canal e vendedor sao dimensoes distintas
        CASE
            WHEN p.vendedor = '72'      THEN 'Marketplace'
            WHEN d.num_pedido IS NULL   THEN 'Balcao-PDV'
            WHEN p.numero IS NULL       THEN '(pedido sem cadastro)'
            ELSE 'Venda interna'
        END                         AS canal,
        CASE WHEN p.vendedor = '72' THEN NULL ELSE p.vendedor END       AS vendedor,
        CASE WHEN p.vendedor = '72' THEN NULL ELSE p.nome_vendedor END  AS nome_vendedor,
        d.quantidade,
        d.vlr_unitario,
        d.vlr_total                 AS receita_bruta,
        -- Regra 3: custo congelado na saida -> custo medio -> ultima compra -> outro armazem
        COALESCE(
            NULLIF(d.custo_saida,     0),   -- D2_CUSTO1, quando disponivel
            NULLIF(b.custo_unitario,  0),   -- C Unitario
            NULLIF(b.vlr_ult_compra,  0),   -- V. Ult. Comp
            NULLIF(o.custo_outro_arm, 0)    -- mesmo SKU, outro armazem
        )                           AS custo_unitario_ref,
        (d.custo_saida IS NOT NULL AND d.custo_saida <> 0) AS custo_congelado
    FROM stg_sd2 d
    LEFT JOIN stg_sb2 b
           ON b.filial = d.filial AND b.produto = d.produto AND b.armazem = d.armazem
    LEFT JOIN LATERAL (
        SELECT COALESCE(NULLIF(b2.custo_unitario, 0), NULLIF(b2.vlr_ult_compra, 0))
                   AS custo_outro_arm
        FROM stg_sb2 b2
        WHERE b2.filial = d.filial AND b2.produto = d.produto AND b2.armazem <> d.armazem
          AND COALESCE(NULLIF(b2.custo_unitario, 0), NULLIF(b2.vlr_ult_compra, 0)) IS NOT NULL
        ORDER BY b2.armazem
        LIMIT 1
    ) o ON TRUE
    LEFT JOIN pedidos p ON p.numero = d.num_pedido
)
SELECT
    base.*,
    quantidade * custo_unitario_ref                     AS custo_total,
    receita_bruta - quantidade * custo_unitario_ref     AS margem_bruta,
    CASE WHEN receita_bruta <> 0
         THEN (receita_bruta - quantidade * custo_unitario_ref) / receita_bruta
    END                                                 AS margem_pct,
    -- flags de qualidade
    (custo_unitario_ref IS NULL)                        AS sem_custo,
    (custo_unitario_ref IS NOT NULL AND receita_bruta <> 0
       AND (receita_bruta - quantidade * custo_unitario_ref) / receita_bruta
           < (SELECT limite FROM param_outlier))         AS outlier_custo
FROM base;

CREATE UNIQUE INDEX ON mv_margem_item (id);
CREATE INDEX ON mv_margem_item (canal, emissao);
CREATE INDEX ON mv_margem_item (vendedor, emissao);
CREATE INDEX ON mv_margem_item (grupo, armazem, emissao);
```

Refresh ao fim do ETL: `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_margem_item;`

O KPI consolidado soma apenas linhas com `sem_custo = FALSE AND outlier_custo = FALSE`.
As demais continuam gravadas e somando na receita total, identificáveis pelas
duas flags na própria view. `param_outlier.limite`
é o corte da Regra 2, ainda não definido — enquanto isso, deixar em `-1.0`
(custo maior que o dobro do preço), que na medição de 07/2026 isola 215 linhas /
R$ 27.407 / 0,3% da receita.

> **Escopo:** esta view calcula **margem bruta**. Não inclui impostos, frete,
> comissão de marketplace nem devoluções — ver seção 0.

---

## 8. Skeleton de carregamento

### Estrutura do projeto

```
Bi_margem_lucro/
├── pyproject.toml            # uv
├── uv.lock
├── docker-compose.yml
├── manage.py
├── config/                   # settings, urls, celery
├── apps/
│   ├── core/                 # models de regra de negócio + admin
│   ├── etl/
│   │   ├── readers.py        # CSV → DataFrame Polars tipado
│   │   ├── writers.py        # DataFrame → Parquet → Postgres
│   │   ├── schemas.py        # contrato de colunas por arquivo
│   │   ├── tasks.py          # tasks Celery
│   │   └── management/commands/carregar_protheus.py
│   └── api/                  # DRF, SQL puro sobre as views
├── frontend/                 # React + Vite
└── data/
    ├── dados/usarei/
    ├── staging/
    └── stack.md
```

### `apps/etl/schemas.py`

```python
"""Contrato de leitura dos arquivos do Protheus.

Os três arquivos compartilham o mesmo formato: separador ';', encoding latin-1,
decimal com vírgula e duas linhas de lixo antes do cabeçalho real.
"""
from dataclasses import dataclass, field

ENCODING = "latin-1"
SEPARADOR = ";"
LINHAS_LIXO = 2  # "SB2;;;;" + linha em branco


@dataclass(frozen=True)
class ArquivoProtheus:
    nome: str
    arquivo: str
    tabela: str
    # cabeçalho original do CSV -> nome da coluna no banco
    colunas: dict[str, str]
    numericas: tuple[str, ...] = ()
    datas: tuple[str, ...] = ()
    # colunas que, se vazias, invalidam a linha
    obrigatorias: tuple[str, ...] = ()
    chave: tuple[str, ...] = field(default_factory=tuple)


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
        "Saldo Disp.": "saldo_disp",
        "Saldo Atual": "saldo_atual",
        "C Unitario": "custo_unitario",
        "Grupo": "grupo",
    },
    numericas=("vlr_ult_compra", "saldo_disp", "saldo_atual", "custo_unitario"),
    obrigatorias=("produto", "armazem"),   # descarta registros de controle da filial
    chave=("filial", "produto", "armazem"),
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
        "Num Ped Clie": "num_ped_cliente",   # notação científica: manter como texto
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
        "Armazem": "armazem",
        "Num. Docto.": "num_docto",
        "Serie": "serie",
        "Item": "item",              # D2_ITEM  — pendente no export
        "Custo": "custo_saida",      # D2_CUSTO1 — pendente no export
        "CFOP": "cfop",              # D2_CF    — pendente no export
        "TES": "tes",                # D2_TES   — pendente no export
        "Emissao": "emissao",
        "Número PDV": "numero_pdv",
    },
    numericas=("quantidade", "vlr_unitario", "vlr_total", "custo_saida"),
    datas=("emissao",),
    obrigatorias=("produto",),
    chave=("filial", "num_docto", "serie", "item"),
)

ARQUIVOS = {a.nome: a for a in (SB2, SC5, SD2)}
```

### `apps/etl/readers.py`

```python
"""CSV bruto do Protheus -> DataFrame Polars tipado."""
from pathlib import Path

import polars as pl

from .schemas import ENCODING, LINHAS_LIXO, SEPARADOR, ArquivoProtheus


def _para_decimal(coluna: str) -> pl.Expr:
    """Converte '1.234,56' e '65,52' para Decimal(18,4).

    O Protheus exporta decimal com vírgula. Alguns campos vêm com separador de
    milhar; remove-se o ponto antes de trocar a vírgula.
    """
    return (
        pl.col(coluna)
        .cast(pl.String)
        .str.strip_chars()
        .str.replace_all(r"\.", "")
        .str.replace(",", ".")
        .replace("", None)
        .cast(pl.Decimal(18, 4), strict=False)
        .alias(coluna)
    )


def _para_data(coluna: str) -> pl.Expr:
    return (
        pl.col(coluna)
        .cast(pl.String)
        .str.strip_chars()
        .replace("", None)
        .str.to_date("%d/%m/%Y", strict=False)
        .alias(coluna)
    )


def ler(spec: ArquivoProtheus, caminho: Path) -> pl.DataFrame:
    """Lê um arquivo do Protheus aplicando o contrato definido em schemas.py.

    Tudo entra como string e é convertido depois — o arquivo tem campos que o
    inferidor de tipo interpretaria errado (Num Ped Clie em notação científica,
    códigos de produto com zeros à esquerda).
    """
    df = pl.read_csv(
        caminho,
        separator=SEPARADOR,
        encoding=ENCODING,
        skip_rows=LINHAS_LIXO,
        infer_schema_length=0,      # tudo como String
        truncate_ragged_lines=True,
        ignore_errors=True,
    )

    faltando = set(spec.colunas) - set(df.columns)
    if faltando:
        raise ValueError(f"{spec.nome}: colunas ausentes no CSV: {sorted(faltando)}")

    df = df.select(list(spec.colunas)).rename(spec.colunas)

    # normaliza texto antes de qualquer filtro
    df = df.with_columns(
        pl.col(c).cast(pl.String).str.strip_chars().replace("", None)
        for c in df.columns
    )

    if spec.obrigatorias:
        df = df.drop_nulls(subset=list(spec.obrigatorias))

    if spec.numericas:
        df = df.with_columns([_para_decimal(c) for c in spec.numericas])
    if spec.datas:
        df = df.with_columns([_para_data(c) for c in spec.datas])

    # grupo vem sem zeros à esquerda no CSV (57, 128) — padroniza em 4 dígitos
    if "grupo" in df.columns:
        df = df.with_columns(
            pl.col("grupo").str.zfill(4).alias("grupo")
        )

    if spec.chave:
        df = df.unique(subset=list(spec.chave), keep="last")

    return df
```

### `apps/etl/writers.py`

```python
"""DataFrame -> Parquet (histórico) -> Postgres (staging)."""
from datetime import date
from pathlib import Path

import polars as pl
from django.db import connection

from .schemas import ArquivoProtheus

STAGING = Path("data/staging")


def gravar_parquet(spec: ArquivoProtheus, df: pl.DataFrame, dt_carga: date) -> Path:
    destino = STAGING / spec.nome.lower() / f"dt_carga={dt_carga:%Y-%m-%d}"
    destino.mkdir(parents=True, exist_ok=True)
    caminho = destino / "part-0.parquet"
    df.write_parquet(caminho, compression="zstd", statistics=True)
    return caminho


def carregar_postgres(spec: ArquivoProtheus, df: pl.DataFrame, dt_carga: date) -> int:
    """Carrega o staging via COPY para tabela temporária + UPSERT.

    O BI é alimentado continuamente, então a carga precisa ser incremental. Vai tudo
    para uma tabela temporária por COPY (rápido) e de lá para a definitiva com
    ON CONFLICT sobre a chave natural do arquivo.

    SB2 é a exceção conceitual: é um snapshot de estoque/custo, não um fato. Enquanto
    D2_CUSTO1 não estiver disponível, ele precisa ser versionado por dt_carga para não
    reescrever a margem de meses já fechados.
    """
    df = df.with_columns(pl.lit(dt_carga).alias("dt_carga"))
    colunas = df.columns
    if not spec.chave:
        raise ValueError(f"{spec.nome}: sem chave natural, carga incremental impossível")

    conflito = ", ".join(spec.chave)
    atualiza = ", ".join(f"{c} = EXCLUDED.{c}" for c in colunas if c not in spec.chave)

    with connection.cursor() as cur:
        cur.execute(f"CREATE TEMP TABLE tmp_carga (LIKE {spec.tabela} INCLUDING DEFAULTS) "
                    f"ON COMMIT DROP")
        with cur.copy(f"COPY tmp_carga ({', '.join(colunas)}) FROM STDIN") as copy:
            for linha in df.iter_rows():
                copy.write_row(linha)

        cur.execute(f"""
            INSERT INTO {spec.tabela} ({', '.join(colunas)})
            SELECT {', '.join(colunas)} FROM tmp_carga
            ON CONFLICT ({conflito}) DO UPDATE SET {atualiza}
        """)
        return cur.rowcount


def refresh_views() -> None:
    with connection.cursor() as cur:
        cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_margem_item")
```

### `apps/etl/management/commands/carregar_protheus.py`

```python
"""Carga dos arquivos do Protheus.

    uv run python manage.py carregar_protheus
    uv run python manage.py carregar_protheus --arquivo SD2
    uv run python manage.py carregar_protheus --somente-parquet
"""
from datetime import date
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.etl import readers, writers
from apps.etl.schemas import ARQUIVOS

ORIGEM = Path("data/dados/usarei")


class Command(BaseCommand):
    help = "Carrega SB2/SC5/SD2 do Protheus para Parquet e Postgres"

    def add_arguments(self, parser):
        parser.add_argument("--arquivo", choices=sorted(ARQUIVOS), action="append")
        parser.add_argument("--origem", type=Path, default=ORIGEM)
        parser.add_argument("--somente-parquet", action="store_true")

    def handle(self, *args, **opts):
        dt_carga = date.today()
        nomes = opts["arquivo"] or list(ARQUIVOS)
        origem: Path = opts["origem"]

        for nome in nomes:
            spec = ARQUIVOS[nome]
            caminho = origem / spec.arquivo
            if not caminho.exists():
                raise CommandError(f"arquivo não encontrado: {caminho}")

            df = readers.ler(spec, caminho)
            parquet = writers.gravar_parquet(spec, df, dt_carga)
            self.stdout.write(f"{nome}: {df.height:>7,} linhas -> {parquet}")

            if not opts["somente_parquet"]:
                n = writers.carregar_postgres(spec, df, dt_carga)
                self.stdout.write(f"{nome}: {n:>7,} linhas -> {spec.tabela}")

        if not opts["somente_parquet"]:
            writers.refresh_views()
            self.stdout.write(self.style.SUCCESS("materialized views atualizadas"))
```

### `apps/etl/tasks.py`

```python
from celery import shared_task
from django.core.management import call_command


@shared_task(name="etl.carregar_protheus")
def carregar_protheus() -> None:
    call_command("carregar_protheus")
```

Agendamento em `config/celery.py`:

```python
app.conf.beat_schedule = {
    "carga-diaria-protheus": {
        "task": "etl.carregar_protheus",
        "schedule": crontab(hour=5, minute=0),
    },
}
```

---

## 9. Medição de referência — 07/2026

Diagnóstico sobre os arquivos originais, usado para calibrar as regras acima.
Serve de baseline: se após a implementação os números divergirem muito disto,
algo mudou no ETL.

Valores **medidos na implementação**, com a cascata completa da Regra 3
(`C Unitario` → `V. Ult. Comp` → outro armazém). São os alvos dos testes.

### Carga

| Métrica | Valor |
|---|---:|
| Linhas SD2 | 38.048 |
| Linhas SC5 | 35.440 |
| Linhas SB2 úteis | 72.102 |
| Receita total | 9.779.156,86 |

### Margem

| Métrica | Valor |
|---|---:|
| Base de cálculo (com custo) | 9.755.839 |
| **Margem bruta — com outliers** | 2.308.106 (**23,7%**) |
| **Margem bruta — com corte em -100%** | **25,8%** |
| Linhas quarentenadas | 203 |
| Linhas sem custo | 66 |

### Canais

| Canal | Linhas | Receita |
|---|---:|---:|
| Marketplace | 33.423 | 6.700.162,94 |
| Venda interna | 3.489 | 2.592.854,08 |
| (pedido sem cadastro) | 581 | 454.091,01 |
| Balcão-PDV | 555 | 32.048,83 |

Sem classificação: 2.251 linhas / R$ 1.126.244,61.

### Origem do custo (cascata da Regra 3)

| Origem | Linhas |
|---|---:|
| `medio` (C Unitario) | 37.707 |
| `ultima_compra` (V. Ult. Comp) | 235 |
| `outro_armazem` | 40 |
| sem custo | 66 |

### Duas correções em relação ao diagnóstico inicial

1. **Base de custo.** A primeira medição usava `V. Ult. Comp` primeiro e chegava a
   23,5% e 215 linhas quarentenadas. Com `C Unitario` na frente (Regra 3), são
   **23,7%** e **203 linhas**.
2. **Fallback de outro armazém.** Recupera 40 das 106 linhas sem custo, deixando
   **66**. Essas 40 entram na base de cálculo, o que explica 23,8% → 23,7%.

Descarte no SB2: 50 linhas têm `Produto` mas não `Armazem`, todas com saldo zero.
Verificado que nenhuma venda sem custo se resolve por elas — o descarte é inócuo.
Por isso `armazem` é obrigatório no reader do SB2.

Observação sobre o SB2: apesar de 39,8% do cadastro estar sem custo, isso atinge só
0,4% da receita — são itens que não vendem. O problema real de custo não é ausência,
é **custo errado** (Regra 2).

---

## 10. Pendências

### Bloqueiam a fase 1

1. **`D2_ITEM` no export do SD2** — sem chave única não há carga incremental.
2. **`D2_CUSTO1` no export do SD2** — sem custo congelado, meses fechados mudam
   sozinhos a cada recarga.
3. **CFOP / TES no export do SD2** — sem isso, remessa e bonificação entram como
   receita. Afeta o lucro **bruto**, não só o líquido.
4. **`Num Ped Clie` exportado como texto.** Hoje 8.971 pedidos do canal marketplace
   saem como `2,00E+15` — o Excel converteu o ID em notação científica. É perda
   irreversível e recorrente a cada exportação. O padrão do campo identifica o
   marketplace de origem (`260701GPMH1RRD` = um; numérico longo = outro), então
   recuperá-lo é o que permite, na fase 2, saber se Shopee rende mais que Mercado
   Livre. Ideal: o Lexos entregar o nome do marketplace em coluna própria.
5. **SC5 com janela ~90 dias maior** que o período do SD2, para eliminar os 4,6% de
   pedidos sem cadastro.
6. **Regra 2** — definir o corte de quarentena de outlier.

### Perguntas ao negócio ainda em aberto

- **Balcão/PDV com -12,6%** em 555 registros: a venda de balcão dá prejuízo mesmo, ou
  o PDV tem outro tratamento de custo/preço?
- **MATEUS B. CARVALHO: 0,9% de margem em 7 linhas / R$ 63.760** — desconto aprovado
  ou erro de cadastro?
- **Grupo vazio**: confirmado como `(sem classificação)`, mas falta saber a origem
  (itens antigos? serviços? uso interno?) para orientar a reclassificação.

### Fase 2

Comissão por marketplace, impostos, frete/seguro, devoluções (SD1 filtrada por
`D1_TIPO = 'D'` + SF1), custo financeiro do prazo. Só então habilitar a tela de
comparação entre canais.
