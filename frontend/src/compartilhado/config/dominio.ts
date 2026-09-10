/** Constantes de dominio que nao dependem de nada — nem de Zod, nem da API.
 *
 *  Moram aqui, e nao em `entidades/`, porque `compartilhado/lib/formato.ts` e
 *  `compartilhado/lib/periodo.ts` precisam de `Granularidade` para formatar um
 *  rotulo. Se o tipo ficasse numa entidade, a camada mais baixa da arquitetura
 *  dependeria de dominio — a inversao que esta migracao veio desfazer. Os
 *  schemas Zod que validam estes valores continuam na entidade correspondente. */

/** Como o eixo do tempo e agregado. Espelha `GRANULARIDADE_COLUNA` em
 *  apps/api/queries.py — a semana e a segunda-feira do date_trunc do Postgres. */
export const GRANULARIDADES = ["dia", "semana", "mes"] as const;
export type Granularidade = (typeof GRANULARIDADES)[number];

/** Perfis do BI. A API aceita um unico perfil por conta — 'gerente + vendedor'
 *  nao significa nada, porque o escopo mais amplo engole o outro. */
export const PERFIS = ["admin", "gerente", "vendedor"] as const;
export type Perfil = (typeof PERFIS)[number];
