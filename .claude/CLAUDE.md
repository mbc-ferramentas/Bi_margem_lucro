# BI de Margem de Lucro

BI de margem bruta sobre exportações CSV do Protheus (`SB2`, `SC5`, `SC6`, `SD1`, `SD2`).
Django 5 + DRF no backend, React 18 + Vite + TS no frontend, Postgres 18 em container.
Tudo roda em Docker — **não existe fluxo de execução no host**.

Fase 1 = margem bruta: `receita − (quantidade × custo unitário)`. Sem impostos, frete,
comissão de marketplace ou devoluções.

## Comandos

Sempre pelo `Makefile` — ele encapsula o `-f` do compose. Apontar o ambiente errado
para o banco errado é o erro mais caro deste projeto.

```bash
make dev        # sobe dev (db + api + web) e roda migrate
make test       # pytest dentro do container da api
make lint       # ruff check + ruff format --check
make carregar   # ETL contra os CSVs em data/dados/usarei
make shell      # django shell
make logs       # logs da api
make deploy     # produção na VPS (docker-compose.vps.yml)
```

Comando avulso no container: `docker compose --env-file container/.env.dev -f container/docker-compose.dev.yml exec bi-margem-lucro-api <cmd>`.

| Serviço | Endereço |
|---|---|
| SPA | http://localhost:5173 |
| API | http://localhost:8000/api/v1 |
| Admin | http://localhost:8000/admin |
| Postgres (dev) | localhost:**5433** |

## Arquitetura

```
config/            settings.py, urls.py (health, admin, api/v1)
apps/core/         models de cadastro + migrations SQL (staging e materialized views)
apps/etl/          readers (Polars) → Parquet → writers (COPY no Postgres)
apps/api/          DRF com SQL puro sobre as views + RBAC
frontend/src/      React + TanStack Query + ECharts (páginas em português)
tests/             ~123 testes ancorados no baseline real de 07/2026
docs/Dados.md      como extrair cada relatório do Protheus
data/stack.md      regras de negócio decididas (fonte da verdade, fora do git)
```

**Fluxo do dado:** CSV (latin-1, `;`, 2 linhas de lixo no topo) → `apps/etl/readers.py`
valida contra `schemas.py` → Parquet em `data/staging/` → `writers.py` grava nas tabelas
`stg_*` → materialized views (`mv_margem_item`, `mv_margem_diaria`, `mv_margem_vendedor`,
`mv_margem_sku`, `mv_carteira_aberta`) → `apps/api/queries.py` lê com SQL puro.

O ORM **não** é usado para consulta de BI: `queries.py` monta SQL parametrizado contra as
materialized views. Os models existem para cadastro/configuração, não para leitura de fatos.

### Migrations SQL
As views vivem em migrations (`0008_layout_08_2026`, `0011_grupos_consolidados`,
`0012_armazem` — a definição vigente é sempre a da migration mais recente que recria a view). Mudar uma view = **nova migration** que dropa e recria; nunca editar
migration já aplicada.

### Refresh das views
Alterar `ParamOutlier`, `MapaCanal`, `MapaGrupo`, `MapaArmazem`, `MapaTES` ou
`ReclassificacaoSKU` no Admin não muda nada nas telas até rodar
`python manage.py refresh_views`.

## Regras de negócio que não se deduzem do código

- **Custo (Regra 3):** cascata `D2_CUSTO1` → `C Unitario` → `V. Ult. Comp` → mesmo SKU em
  outro armazém → `sem_custo`. `D2_CUSTO1` vem como **total da linha**, não unitário — a
  view divide por `Quantidade`. O `SB2` é versionado por `dt_carga` para casar cada venda
  com o snapshot da própria competência.
- **Desconto:** o Protheus registra à parte; `Vlr.Total = Quantidade × Vlr.Unitário`. A view
  expõe receita cheia e líquida lado a lado, e a tela mostra as duas margens.
- **Canal ≠ vendedor (Regra 1):** o código 72 é o integrador Lexos (Amazon, Magalu, Shopee,
  ML), não uma pessoa. Vira canal e nunca entra em ranking de vendedor.
- **Armazém > grupo:** a hierarquia da análise. O mesmo grupo vende por vários armazéns
  (Ecommerce sai por 4 deles), então grupo sozinho não organiza nada. O código é padronizado
  em **2 dígitos** no ETL (`01`, `02`) — o Protheus manda `1`, `2`; sem isso o próprio
  `ORDER BY` põe `13` antes de `2`. `MapaArmazem` dá o rótulo; armazém sem cadastro aparece
  como `20 - sem cadastro`, nunca some da tela. As listas de filtro vêm em **cascata**
  (`filtros.facetas`): cada dimensão é recortada pelas outras, nunca por si mesma.
- **Grupo (Regra 4):** reclassificação manual → grupo do `SD2` → cadastro do `SB2` →
  `Sem grupo`. O código cru fica em `grupo_codigo_origem`; o `grupo_codigo` publicado já é o
  **consolidado** por `MapaGrupo.agrupa_em` (0150 soma em 0057), porque o filtro da API casa
  por código. Cada grupo cadastrado é um **marcador próprio** na tela e o filtro aceita vários
  ao mesmo tempo (`?grupo=0128,0129`); `Sem grupo` é a sentinela do vazio e nunca é somada nos
  outros em silêncio. Grupo novo do Protheus se resolve pelo Admin + `refresh_views`, sem
  migration — a migration `0013` só semeia os rótulos que o negócio já nomeou (despesas, EPI,
  ativo imobilizado, consumo interno) e devolve identidade própria ao 0129 (fabricação própria,
  antes somado dentro do Ecommerce por engano).
- **TES (`D2_TES`):** todo TES nasce em `MapaTES` como venda; desmarcar `gera_receita` tira a
  linha do KPI **sem** tirá-la do faturamento.
- **Fora do KPI:** `sem_custo`, `outlier_custo` (limite em `ParamOutlier`, padrão −100%) e TES
  não-venda. Continuam gravados e somando na receita total. Margem entre o limite e zero
  **permanece** no KPI — prejuízo plausível não é erro.
- **Carteira (`SC6`):** pedido em aberto não é receita e vive em view separada
  (`mv_carteira_aberta`); somar com a margem inflaria o faturamento. O período ali é
  **data de entrega**, não competência.
- **`SD1`:** carregado para staging mas fora da margem da fase 1.

## Segurança e RBAC

- Perfis: `admin`, `gerente`, `vendedor` (`apps/api/permissions.py`).
- O escopo do `vendedor` é aplicado na **cláusula base do SQL**, nunca filtrando resultado em
  Python depois — filtro posterior vaza dado por agregado, exportação ou contagem.
- `vendedor` sem vínculo em `core.Vendedor` recebe `PermissionDenied`, nunca lista vazia.
- Auth por JWT (SimpleJWT, access 30min, refresh 7d com rotação).
- O usuário `admin` (migration `0007`) é **protegido**: imutável pela aplicação em 4 camadas
  (`has_change_permission`, `has_delete_permission`, ação em massa, `delete()` do model).
  Alterar exige SQL direto no banco. Não tente contornar isso.
- Valores monetários são serializados como **string** (`JSONRendererFinanceiro`) — float
  perderia centavos. Não troque para o renderer padrão do DRF.

## Convenções

- Código, nomes de arquivo, models e páginas em **português**; comentários explicam *por quê*,
  não *o quê*.
- `ruff`, `line-length = 100`, target py312. Lint com `select = ["E","F","I","UP","B","DJ"]`.
- Testes com `pytest-django`; a fixture `carga` (session-scoped, `tests/conftest.py`) roda o
  ETL contra os CSVs reais. Os números esperados são o baseline de 07/2026 — se um teste de
  valor quebra, verifique se o dado mudou antes de mudar o teste.
- `tests/test_contrato_frontend.py` amarra o contrato da API com o frontend: mudar o payload
  exige atualizar os tipos em `frontend/src/api/tipos.ts`.
- Dependências Python via `uv` (`uv.lock`); frontend via npm.

## Não faça

- Não rode `manage.py`/`pytest` fora do container.
- Não confunda `docker-compose.dev.yml` com `docker-compose.vps.yml`.
- Não commite nada de `data/dados/usarei/`, `data/staging/` ou `container/.env*` (já no
  `.gitignore`) — são dados reais da empresa.
- Não edite migrations já aplicadas.
