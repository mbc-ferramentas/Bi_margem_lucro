---
description: Diagnostica ou executa a carga de CSVs do Protheus
---
Pipeline: CSV latin-1 (`;`, 2 linhas de lixo no topo) → `apps/etl/readers.py` valida contra
`apps/etl/schemas.py` → Parquet em `data/staging/` → `apps/etl/writers.py` grava nas `stg_*`
→ `refresh_views`.

Orquestração compartilhada em `apps/etl/servicos.py`, com duas portas de entrada:
`manage.py carregar_protheus` (CLI) e o endpoint de upload (`POST /api/v1/carga`).
Ordem obrigatória: SB2 → SC5 → SC6 → SD1 → SD2. Trava no Postgres (`LOCK_CARGA`) impede
carga concorrente.

Tarefa: $ARGUMENTS

Ao investigar falha de carga, comece pelo registro em `core.ExecucaoCarga` e pelos logs
(`make logs`). Nunca altere os CSVs de origem — são montados somente-leitura.
