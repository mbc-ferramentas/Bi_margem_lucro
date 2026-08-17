# Encapsula o `-f` dos composes: apontar o ambiente errado para o banco errado
# e o erro mais caro possivel neste projeto.

DEV  := docker compose --env-file container/.env.dev -f container/docker-compose.dev.yml
PROD := docker compose -f container/docker-compose.vps.yml
API  := bi-margem-lucro-api

.PHONY: dev down logs shell migrate carregar test lint deploy

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

deploy:                   ## producao na VPS
	$(PROD) up -d --build
	$(PROD) exec $(API) python manage.py migrate

# Backup do banco de producao NAO e responsabilidade desta stack: o Postgres
# roda no host da VPS e o dump e agendado la (ver container/README.dev.md).
