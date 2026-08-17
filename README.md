# BI de Margem de Lucro

Margem bruta por SKU, vendedor, grupo e canal, sobre as exportações do Protheus
(`SB2`, `SC5`, `SD1`, `SD2`).

**Fase 1 — margem bruta:** `receita − (quantidade × custo unitário)`.
Não inclui impostos, frete, comissão de marketplace nem devoluções. A fase 2 e as
regras de negócio decididas estão em [`data/stack.md`](data/stack.md).

## Subir o ambiente

```bash
make dev          # container/docker-compose.dev.yml + migrate
make carregar     # ETL contra os CSVs em data/dados/usarei
make test         # 100 testes
```

Sem `make`:

```bash
docker compose -f container/docker-compose.dev.yml up -d --build
docker compose -f container/docker-compose.dev.yml exec api python manage.py migrate
docker compose -f container/docker-compose.dev.yml exec api python manage.py carregar_protheus
```

| Serviço | Endereço |
|---|---|
| SPA | http://localhost:5173 |
| API | http://localhost:8000/api/v1 |
| Admin | http://localhost:8000/admin |
| Postgres | localhost:**5433** |

## Produção

```bash
docker volume create bi_margem_pgdata   # uma vez, antes do primeiro deploy
cp container/.env.example container/.env   # e preencha
make deploy
```

O banco roda em container, sem porta publicada no host. O volume `pgdata` é
`external` para sobreviver a um `docker compose down -v`, e o serviço `backup` faz
`pg_dump` diário. **Teste a restauração antes do go-live.**

## Conta administrativa

Usuário `admin`, criado pela migration `0007` como superusuário **protegido**.

É a saída de emergência: se alguém errar as permissões ou se trancar para fora do
Admin, essa conta continua entrando. Por isso é imutável pela aplicação — nem outro
superusuário, nem ela mesma, alteram ou removem pela interface. A barreira existe em
três camadas: `has_change_permission`, `has_delete_permission`, a ação de exclusão em
massa, e o `delete()` do próprio model (bloqueia até por `manage.py shell`).

**Alterar exige acesso direto ao banco:**

```sql
-- trocar a senha (gere o hash com: python manage.py shell -c
-- "from django.contrib.auth.hashers import make_password; print(make_password('nova'))")
UPDATE core_usuario SET password = '<hash>' WHERE username = 'admin';

-- liberar a conta para edição pela interface
UPDATE core_usuario SET protegido = false WHERE username = 'admin';
```

A senha inicial vem de `ADMIN_SENHA_INICIAL` e só é aplicada na criação — trocá-la
no banco não é desfeito pelo próximo `migrate`.

> **Defina `ADMIN_SENHA_INICIAL` no `container/.env` antes do primeiro deploy.** O padrão do
> código é conhecido por qualquer pessoa com acesso ao repositório.

## Estrutura

```
apps/core/     models de cadastro, migrations SQL (staging + materialized views)
apps/etl/      leitura dos CSVs (Polars), Parquet, carga no Postgres
apps/api/      DRF: SQL puro sobre as views, RBAC
frontend/      React + Vite + TS, TanStack Query, ECharts
tests/         100 testes ancorados no baseline de 07/2026
```

O `SD1` (itens de nota de entrada) é carregado para o staging mas **não entra na
margem da fase 1**: o export cobre 46 competências, de 2000 a 08/2026, enquanto o
`SD2` é de 07/2026 — devolução só entra no cálculo na fase 2, por competência da
venda original.

## Como o cálculo funciona

**Custo** (Regra 3): `D2_CUSTO1` → `C Unitario` → `V. Ult. Comp` → mesmo SKU em
outro armazém → `sem_custo`. Desde o export de 08/2026 o `D2_CUSTO1` existe e atende
98,8% das linhas — é o custo congelado na nota, o que torna o passado imutável por
construção. Atenção: ele vem como **custo total da linha**, não unitário; a view
divide por `Quantidade` antes de comparar com o `SB2`. As 469 linhas de custo zero
continuam caindo na cascata antiga, e para elas o `SB2` segue versionado por
`dt_carga`, casando cada venda com o snapshot da própria competência.

**Desconto**: o Protheus registra o desconto à parte — `Vlr.Total` continua sendo
`Quantidade × Vlr.Unitário`. Em 07/2026 são R$ 1.186.557, 12% do faturamento. Por
isso a view expõe as duas medidas lado a lado e a tela mostra ambas: margem bruta
25,9% sobre a receita cheia, 15,7% sobre a receita líquida de desconto.

**Tipo de saída (`D2_TES`)**: chegou no export e distingue venda de remessa,
bonificação e transferência — mas o BI não adivinha qual é qual. Todo TES nasce em
`MapaTES` contando como venda; desmarcar `gera_receita` no Admin tira a linha do KPI
sem tirá-la do faturamento. Os 32 códigos do período já vêm cadastrados.

**Grupo** (Regra 4): reclassificação manual → grupo da linha faturada (`SD2`) →
cadastro do `SB2` → `(sem classificação)` (2.232 linhas, 11,2% da receita).

**Canal ≠ vendedor** (Regra 1): o código 72 é o integrador Lexos (Amazon, Magalu,
Shopee, Mercado Livre), não uma pessoa — 94% dos pedidos. Vira canal, nunca entra em
ranking de vendedor. O armazém não segmenta canal: 97,9% da receita está no
armazém 02.

**Fora do KPI:** linhas sem custo, outliers de custo e TES marcados como não-venda (margem abaixo do limite em
`ParamOutlier`, padrão −100%). Não somem do faturamento — continuam gravadas e
somando na receita total. A API não reporta quantas são; para auditar, consulte
as flags `sem_custo` / `outlier_custo` em `mv_margem_item`. Margem entre o limite
e zero **permanece** no KPI: é prejuízo plausível, não erro.

> Alterar `ParamOutlier`, `MapaCanal`, `MapaGrupo`, `MapaTES` ou `ReclassificacaoSKU`
> no Admin exige `python manage.py refresh_views` para valer nas telas.

## Pendências no export do Protheus

Bloqueiam evolução (detalhe em `data/stack.md` §10):

1. **`D2_ITEM`** — sem chave única não há carga incremental; hoje a carga substitui
   a competência inteira. Vale também para o `SD1`.
2. ~~`D2_CUSTO1`~~ — **resolvido** no export de 08/2026.
3. **CFOP** — o `TES` chegou; o CFOP ainda não. Enquanto a classificação dos 32
   códigos de TES não for feita no Admin, remessa e bonificação seguem contando
   como receita.
4. **`Num Ped Clie` como texto** — hoje 8.971 pedidos saem como `2,00E+15`; o Excel
   converte o ID em notação científica e o dado se perde a cada exportação.
# Bi_margem_lucro
# Bi_margem_lucro
# Bi_margem_lucro
