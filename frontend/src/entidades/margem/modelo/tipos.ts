import { z } from "zod";
import { contagem, dinheiro, numero } from "@compartilhado/api/primitivas";
import { escopoSchema } from "@compartilhado/api/primitivas";
import { GRANULARIDADES } from "@compartilhado/config";

export const kpisSchema = z.object({
  kpis: z.object({
    receita_bruta: dinheiro,
    /** O Protheus registra o desconto a parte: `receita_bruta` e o faturamento
     *  cheio, `receita_liquida` e o que o cliente efetivamente pagou. */
    desconto_total: dinheiro,
    receita_liquida: dinheiro,
    custo_total: dinheiro,
    margem_bruta: dinheiro,
    margem_pct: numero,
    margem_liquida: dinheiro,
    margem_liquida_pct: numero,
    ticket_medio: dinheiro,
    pedidos: contagem,
    skus: contagem,
    linhas: contagem,
    quantidade: numero,
  }),
  escopo: escopoSchema,
});
export type Kpis = z.infer<typeof kpisSchema>["kpis"];

export const serieSchema = z.object({
  granularidade: z.enum(GRANULARIDADES),
  serie: z.array(
    z.object({
      periodo: z.string(),
      canal: z.string(),
      receita: dinheiro,
      receita_liquida: dinheiro,
      desconto: dinheiro,
      custo: dinheiro,
      margem: dinheiro,
      margem_liquida: dinheiro,
      margem_pct: numero,
      pedidos: contagem,
    }),
  ),
  escopo: escopoSchema,
});
export type PontoSerie = z.infer<typeof serieSchema>["serie"][number];
