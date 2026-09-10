---
description: Cria uma migration que altera uma materialized view de margem
---
As materialized views (`mv_margem_item`, `mv_margem_diaria`, `mv_margem_vendedor`,
`mv_margem_sku`, `mv_carteira_aberta`) vivem em migrations SQL de `apps/core/migrations/`.

Para alterar uma delas: $ARGUMENTS

1. Leia a migration que criou a versão atual da view (`0003_views_margem.py`,
   `0005_escopo_nas_agregadas.py`, `0010_sc6_carteira.py`) — **não edite nenhuma delas**.
2. Crie uma nova migration com `migrations.RunSQL`, com `DROP MATERIALIZED VIEW IF EXISTS`
   + `CREATE` e o `reverse_sql` correspondente.
3. Recrie todos os índices da view (inclusive o GIN de `descricao`).
4. Verifique se `apps/api/queries.py` e o modelo da entidade em `frontend/src/entidades/` precisam acompanhar.
5. Rode `make migrate` e depois `make test`.
