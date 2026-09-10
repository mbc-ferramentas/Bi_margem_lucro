import { z } from "zod";
import { contagem, dinheiro, numero } from "@compartilhado/api/primitivas";
import { escopoSchema } from "@compartilhado/api/primitivas";

/** Armazem > grupo: uma linha por par, o aninhamento e da tela. */
export const armazensSchema = z.object({
  armazens: z.array(
    z.object({
      armazem: z.string().nullable(),
      armazem_rotulo: z.string().nullable(),
      grupo_codigo: z.string().nullable(),
      grupo_rotulo: z.string().nullable(),
      receita: dinheiro,
      receita_liquida: dinheiro,
      desconto: dinheiro,
      custo: dinheiro,
      margem: dinheiro,
      margem_liquida: dinheiro,
      margem_pct: numero,
      pedidos: contagem,
      linhas: contagem,
      quantidade: numero,
    }),
  ),
  escopo: escopoSchema,
});
export type LinhaArmazem = z.infer<typeof armazensSchema>["armazens"][number];
