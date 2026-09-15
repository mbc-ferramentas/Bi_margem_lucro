# Encapsula o `-f` dos composes: apontar o ambiente errado para o banco errado
# e o erro mais caro possivel neste projeto.

DEV  := docker compose --env-file container/.env.dev -f container/docker-compose.dev.yml
PROD := docker compose -f container/docker-compose.vps.yml
API  := bi-margem-lucro-api
WEB  := bi-margem-lucro-web

.PHONY: dev down logs shell migrate carregar test lint deploy web-sh web-lint web-test web-build e2e e2e-atualizar

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

# O node_modules do front e um volume nomeado que cobre o da imagem: bun so
# funciona de dentro do container. package.json e bun.lock sao bind mount e
# voltam para o host sozinhos (nascem com dono root — devolva com chown).
web-sh:                   ## shell no container do frontend
	$(DEV) exec $(WEB) sh

web-lint:                 ## typecheck do frontend (tsc --noEmit)
	$(DEV) exec $(WEB) bun run lint

web-test:                 ## vitest do frontend
	$(DEV) exec $(WEB) bun run test

web-build:                ## build de producao do SPA
	$(DEV) exec $(WEB) bun run build

# E2E com prints: compara cada tela contra o baseline em e2e/testes/__prints__/.
# Relatorio HTML (com o print de cada tela e o diff quando falha) em e2e/relatorio/.
# Filtre com ARGS, ex.: make e2e ARGS="-g skus --project=desktop"
e2e:                      ## testes E2E com comparacao de prints (precisa do make dev)
	$(DEV) run --rm bi-margem-lucro-e2e $(ARGS)

e2e-atualizar:            ## regrava o baseline de prints (revise as imagens no git diff)
	$(DEV) run --rm bi-margem-lucro-e2e --update-snapshots $(ARGS)

deploy:                   ## producao na VPS
	# migrate e collectstatic rodam no proprio container da api (ver vps.yml).
	$(PROD) up -d --build

# roda no host da VPS e o dump e agendado la (ver container/README.dev.md).
