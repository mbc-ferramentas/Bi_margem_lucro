import { z } from "zod";
import { contagem, dinheiro, numero } from "@compartilhado/api/primitivas";
import { escopoSchema } from "@compartilhado/api/primitivas";

export const vendedoresSchema = z.object({
  vendedores: z.array(
    z.object({
      vendedor_codigo: z.string().nullable(),
      vendedor_nome: z.string().nullable(),
      canal: z.string(),
      receita: dinheiro,
      receita_liquida: dinheiro,
      desconto: dinheiro,
      custo: dinheiro,
      margem: dinheiro,
      margem_liquida: dinheiro,
      margem_pct: numero,
      pedidos: contagem,
      linhas: contagem,
    }),
  ),
  observacao: z.string(),
  escopo: escopoSchema,
});
export type Vendedor = z.infer<typeof vendedoresSchema>["vendedores"][number];
