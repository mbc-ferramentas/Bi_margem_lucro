# Docker — Bi Margem de Lucro

Dois ambientes, dois arquivos. **Nunca** existe um `docker-compose.yml` generico:
apontar o ambiente errado para o banco errado e o erro mais caro deste projeto.

| Arquivo | Uso |
|---|---|
| `docker-compose.dev.yml` | desenvolvimento e testes na maquina local |
| `docker-compose.vps.yml` | producao na VPS |

Imagens: `api.Dockerfile` (targets `dev`/`prod`) e `web.Dockerfile`
(targets `development`/`builder`/`production`). **O contexto de build das duas e a
raiz do repositorio**, por isso cada uma tem seu `<dockerfile>.dockerignore`.

---

## Desenvolvimento

```bash
cp container/.env.dev.example container/.env.dev   # ajuste as portas se precisar
make dev                                            # sobe tudo + migrate
```

Sem `make`:

```bash
docker compose --env-file container/.env.dev -f container/docker-compose.dev.yml up -d --build
```

Sobe 3 servicos: `bi-margem-lucro-{db,api,web}`.
O Postgres 18 **roda em container no dev** — nada precisa estar instalado no host.

| Serviço | Porta no host | Variavel |
|---|---|---|
| api (Django) | 8000 | `API_HOST_PORT` |
| web (Vite) | 5173 | `WEB_HOST_PORT` |
| db (Postgres) | 5433 | `DB_HOST_PORT` |

Login inicial: usuario `admin`, senha vinda de `ADMIN_SENHA_INICIAL`
(default `mbcti123` em dev).

> Conflito de portas: `Bi_controle_financeiro` usa 8000/5173/5432 e
> `App_Compra_inteligente` usa 8001/5174/5433. Para rodar em paralelo, mude as
> portas em `container/.env.dev` (ex.: 8002/5175/5434).

Comandos uteis: `make logs`, `make migrate`, `make test`, `make lint`,
`make carregar` (ETL contra os CSVs reais), `make down`.

## Como os dados entram

Quem alimenta o BI e o **administrador**, enviando os CSVs exportados do Protheus
(SB2/SC5/SD1/SD2) na tela **Uploads**. O processamento e sincrono e leva ~6s no
volume atual (~145 mil linhas); a resposta traz o resultado por arquivo.

- Nao ha job agendado nem fila: o projeto **nao usa Celery/Redis**.
- Cargas simultaneas sao serializadas por advisory lock do Postgres — a segunda
  recebe 409 em vez de corromper a competencia.
- Os CSVs sao descartados ao fim da requisicao. O historico auditavel e o Parquet
  particionado por `dt_carga` no volume `staging`.
- `make carregar` faz a mesma coisa pela linha de comando, contra
  `data/dados/usarei` — util em dev e para recuperacao manual.

---

## Producao (VPS)

A VPS hospeda varias stacks. Por isso, **nenhum servico publica porta**: todos
ficam so com `expose` na rede Docker externa `internal-services`, e o proxy
reverso da VPS (fora desta stack) faz TLS e roteamento.

### Pre-requisitos

1. **Rede compartilhada** (uma vez por VPS):
   ```bash
   docker network create internal-services
   ```
2. **Postgres no host**, com base e usuario criados. Os containers o alcancam
   via `host.docker.internal` (mapeado por `extra_hosts`). Configure em
   `container/.env`: `POSTGRES_HOST=host.docker.internal`.
3. **Proxy reverso** da VPS apontando para:
   - SPA e estaticos → `bi-margem-lucro-web:80`
   - `/api/` e `/admin/` → `bi-margem-lucro-api:8000`

   O nginx de dentro do container `web` (`nginx.web.conf`) serve **apenas** o SPA
   e `/static/`; ele nao faz proxy da API.

   O upload dos CSVs passa por esse proxy: garanta `client_max_body_size` maior
   que `MAX_UPLOAD_CSV_MB` e `proxy_read_timeout` acima de 60s, senao a carga e
   cortada no meio.

### Deploy

```bash
cp container/.env.example container/.env   # preencha os segredos
make deploy                                 # up -d --build + migrate
```

### Backup

Nao e responsabilidade desta stack — o Postgres roda no host, entao o dump e
agendado no proprio host (cron + `pg_dump`), junto com o dos demais projetos.
