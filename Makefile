# Encapsula o `-f` dos composes: apontar o ambiente errado para o banco errado
# e o erro mais caro possivel neste projeto.

DEV  := docker compose --env-file container/.env.dev -f container/docker-compose.dev.yml
PROD := docker compose -f container/docker-compose.vps.yml
API  := bi-margem-lucro-api
WEB  := bi-margem-lucro-web

.PHONY: dev down logs shell migrate carregar test lint deploy web-sh web-lint web-test web-build

dev:                      ## sobe o ambiente de desenvolvimento
	$(DEV) up -d --build
	$(DEV) exec $(API) python manage.py migrate

down:                     ## derruba o dev (mantem os volumes)
	$(DEV) down

logs:
	$(DEV) logs -f $(API)

shell:
	$(DEV) exec $(API) python manage.py shell

migrate:
	$(DEV) exec $(API) python manage.py migrate

carregar:                 ## roda o ETL contra os CSVs reais (em producao, use a tela de Uploads)
	$(DEV) exec $(API) python manage.py carregar_protheus

test:
	$(DEV) exec $(API) pytest -v

lint:
	$(DEV) exec $(API) ruff check .
	$(DEV) exec $(API) ruff format --check .

# O node_modules do front e um volume nomeado que cobre o da imagem: npm so
# funciona de dentro do container. package.json e package-lock.json sao bind
# mount e voltam para o host sozinhos.
web-sh:                   ## shell no container do frontend
	$(DEV) exec $(WEB) sh

web-lint:                 ## typecheck do frontend (tsc --noEmit)
	$(DEV) exec $(WEB) npm run lint

web-test:                 ## vitest do frontend
	$(DEV) exec $(WEB) npm run test

web-build:                ## build de producao do SPA
	$(DEV) exec $(WEB) npm run build

deploy:                   ## producao na VPS
	# migrate e collectstatic rodam no proprio container da api (ver vps.yml).
	$(PROD) up -d --build

# Backup do banco de producao NAO e responsabilidade desta stack: o Postgres
# roda no host da VPS e o dump e agendado la (ver container/README.dev.md).
