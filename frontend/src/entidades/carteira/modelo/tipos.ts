import { z } from "zod";
import { contagem, dinheiro, numero } from "@compartilhado/api/primitivas";
import { escopoSchema } from "@compartilhado/api/primitivas";

/** Carteira de pedidos em aberto (SC6).
 *
 *  Os valores sao sempre a parte que **falta sair**: `qtd_aberta` e `vlr_aberto`
 *  descontam o que ja foi entregue. A margem e prevista, apoiada no cadastro de
 *  custo do SB2 — sem nota fiscal nao existe custo congelado. */
export const carteiraSchema = z.object({
  total: z.number(),
  limite: z.number(),
  offset: z.number(),
  resumo: z.object({
    itens: contagem,
    pedidos: contagem,
    skus: contagem,
    quantidade: numero,
    valor_aberto: dinheiro,
    custo_previsto: dinheiro,
    margem_prevista: dinheiro,
    margem_prevista_pct: numero,
    valor_medio_pedido: dinheiro,
    itens_atrasados: contagem,
    valor_atrasado: dinheiro,
    itens_sem_custo: contagem,
    /** Pedidos fora da janela do export do SC5: ficam sem vendedor e sem nome
     *  de cliente. Exibido na tela para o numero nao parecer um bug. */
    itens_sem_cadastro: contagem,
    dt_foto: z.string().nullable(),
    entrega_min: z.string().nullable(),
    entrega_max: z.string().nullable(),
  }),
  itens: z.array(
    z.object({
      id: z.string(),
      num_pedido: z.string(),
      sku: z.string(),
      descricao: z.string().nullable(),
      grupo: z.string().nullable(),
      armazem: z.string().nullable(),
      armazem_rotulo: z.string().nullable(),
      canal: z.string(),
      vendedor_codigo: z.string().nullable(),
      vendedor_nome: z.string().nullable(),
      cod_cliente: z.string().nullable(),
      nome_cliente: z.string().nullable(),
      dt_emissao: z.string().nullable(),
      dt_entrega: z.string().nullable(),
      dias_em_aberto: z.number().nullable(),
      atrasado: z.boolean(),
      qtd_pedida: numero,
      qtd_entregue: numero,
      qtd_aberta: numero,
      vlr_unitario: dinheiro,
      vlr_aberto: dinheiro,
      custo_aberto: dinheiro,
      margem_prevista: dinheiro,
      margem_prevista_pct: numero,
      sem_custo: z.boolean(),
    }),
  ),
  observacao: z.string(),
  escopo: escopoSchema,
});
export type Carteira = z.infer<typeof carteiraSchema>;
export type ItemCarteira = Carteira["itens"][number];
export type ResumoCarteira = Carteira["resumo"];

export const carteiraFiltrosSchema = z.object({
  opcoes: z.object({
    canais: z.array(z.string()),
    armazens: z.array(z.object({ codigo: z.string(), rotulo: z.string().nullable() })),
    grupos: z.array(
      z.object({
        codigo: z.string(),
        rotulo: z.string().nullable(),
        sem_movimento: z.boolean(),
      }),
    ),
    vendedores: z.array(
      z.object({ codigo: z.string(), nome: z.string().nullable() }),
    ),
  }),
  escopo: escopoSchema,
});
