import { z } from "zod";
import { contagem, dinheiro, numero } from "@compartilhado/api/primitivas";
import { escopoSchema } from "@compartilhado/api/primitivas";

/** Pedidos faturados (SD2) — o drill-down de `Por armazem`.
 *
 *  E o oposto da carteira: aqui cada linha ja virou nota. Por isso a lista **nao**
 *  aplica o corte de qualidade do KPI — linha sem custo ou com outlier continua
 *  sendo faturamento. `receita` e o faturado; `receita_no_kpi` e a parte que entra
 *  no indicador, e e ela que reconcilia com a tela `Por armazem`. */
export const pedidosSchema = z.object({
  total: z.number(),
  limite: z.number(),
  offset: z.number(),
  resumo: z.object({
    pedidos: contagem,
    /** Notas ≠ pedidos: um pedido pode ser faturado em várias notas. */
    notas: contagem,
    itens: contagem,
    skus: contagem,
    receita: dinheiro,
    desconto: dinheiro,
    receita_liquida: dinheiro,
    custo: dinheiro,
    margem: dinheiro,
    receita_no_kpi: dinheiro,
    margem_pct: numero,
    ticket_medio: dinheiro,
    itens_fora_do_kpi: contagem,
  }),
  pedidos: z.array(
    z.object({
      /** Numero do pedido, ou `PDV-<id da linha>` na venda de balcao, que nao tem
       *  numero de documento no export. */
      chave: z.string(),
      origem: z.enum(["pedido", "pdv"]),
      emissao: z.string().nullable(),
      competencia: z.string().nullable(),
      cod_cliente: z.string().nullable(),
      nome_cliente: z.string().nullable(),
      canal: z.string(),
      vendedor_codigo: z.string().nullable(),
      vendedor_nome: z.string().nullable(),
      armazem: z.string().nullable(),
      armazem_rotulo: z.string().nullable(),
      /** Uma das notas do pedido — só significa "a nota" quando `notas` é 1. */
      nota_fiscal: z.string().nullable(),
      serie_nf: z.string().nullable(),
      notas: contagem,
      /** Maior que 1 quando o pedido sai por mais de um armazem. */
      armazens: contagem,
      itens: contagem,
      quantidade: numero,
      receita: dinheiro,
      desconto: dinheiro,
      receita_liquida: dinheiro,
      custo: dinheiro,
      margem: dinheiro,
      margem_liquida: dinheiro,
      margem_pct: numero,
      itens_fora_do_kpi: contagem,
    }),
  ),
  escopo: escopoSchema,
});
export type Pedidos = z.infer<typeof pedidosSchema>;
export type LinhaPedido = Pedidos["pedidos"][number];
export type ResumoPedidos = Pedidos["resumo"];

/** Um pedido faturado: cabecalho, totais e itens. */
export const pedidoSchema = z.object({
  pedido: z.object({
    chave: z.string(),
    origem: z.enum(["pedido", "pdv"]),
    num_pedido: z.string().nullable(),
    numero_pdv: z.string().nullable(),
    emissao: z.string().nullable(),
    competencia: z.string().nullable(),
    cod_cliente: z.string().nullable(),
    nome_cliente: z.string().nullable(),
    canal: z.string(),
    vendedor_codigo: z.string().nullable(),
    vendedor_nome: z.string().nullable(),
    armazens: z.array(z.string()),
    /** Todas as notas fiscais do pedido, na ordem. */
    notas: z.array(z.object({ nota_fiscal: z.string(), serie_nf: z.string() })),
    itens: contagem,
    quantidade: numero,
    receita: dinheiro,
    desconto: dinheiro,
    receita_liquida: dinheiro,
    custo: dinheiro,
    margem: dinheiro,
    margem_pct: numero,
    margem_liquida: dinheiro,
    margem_liquida_pct: numero,
    /** Linhas que somam receita mas ficam fora do indicador de margem. */
    itens_fora_do_kpi: contagem,
    /** Linhas do mesmo pedido que o filtro atual deixou de fora (outro armazem,
     *  outra competencia). Sem isso o total do detalhe divergiria da lista sem
     *  explicacao. */
    linhas_fora_do_recorte: contagem,
  }),
  itens: z.array(
    z.object({
      id: z.string(),
      /** A nota que faturou esta linha. Duas linhas do mesmo pedido podem ter
       *  saído em notas diferentes. */
      nota_fiscal: z.string().nullable(),
      serie_nf: z.string().nullable(),
      sku: z.string(),
      descricao: z.string().nullable(),
      grupo_codigo: z.string().nullable(),
      grupo_rotulo: z.string().nullable(),
      grupo_reclassificado: z.boolean(),
      armazem: z.string().nullable(),
      armazem_rotulo: z.string().nullable(),
      tes: z.string().nullable(),
      tes_receita: z.boolean(),
      quantidade: numero,
      vlr_unitario: dinheiro,
      receita_bruta: dinheiro,
      desconto: dinheiro,
      receita_liquida: dinheiro,
      custo_unitario_ref: dinheiro,
      /** Qual degrau da cascata de custo (Regra 3) atendeu a linha. */
      origem_custo: z
        .enum(["saida", "medio", "ultima_compra", "outro_armazem"])
        .nullable(),
      custo_total: dinheiro,
      margem_bruta: dinheiro,
      margem_liquida: dinheiro,
      margem_pct: numero,
      sem_custo: z.boolean(),
      outlier_custo: z.boolean(),
    }),
  ),
  escopo: escopoSchema,
});
export type Pedido = z.infer<typeof pedidoSchema>;
export type CabecalhoPedido = Pedido["pedido"];
export type ItemPedido = Pedido["itens"][number];
