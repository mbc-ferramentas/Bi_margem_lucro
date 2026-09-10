import { z } from "zod";
import { contagem, dinheiro, numero } from "@compartilhado/api/primitivas";
import { escopoSchema } from "@compartilhado/api/primitivas";

export const skusSchema = z.object({
  total: z.number(),
  limite: z.number(),
  offset: z.number(),
  itens: z.array(
    z.object({
      sku: z.string(),
      descricao: z.string().nullable(),
      grupo: z.string().nullable(),
      quantidade: numero,
      receita: dinheiro,
      receita_liquida: dinheiro,
      desconto: dinheiro,
      custo: dinheiro,
      margem: dinheiro,
      margem_liquida: dinheiro,
      margem_pct: numero,
    }),
  ),
  escopo: escopoSchema,
});
export type ItemSku = z.infer<typeof skusSchema>["itens"][number];

/** Um SKU aberto em pedidos, notas, vendedores e suprimentos.
 *
 *  Le `mv_margem_item`, nao a agregada `mv_margem_sku` que alimenta a lista:
 *  por isso os totais daqui podem ser **maiores** que os da linha da lista, que
 *  ja nasce sem as linhas sem custo e sem os outliers. `itens_fora_do_kpi` e o
 *  numero que explica a diferenca.
 */
export const skuDetalheSchema = z.object({
  total: z.number(),
  limite: z.number(),
  offset: z.number(),
  sku: z.object({
    sku: z.string(),
    descricao: z.string().nullable(),
    grupo_codigo: z.string().nullable(),
    grupo_rotulo: z.string().nullable(),
    grupo_reclassificado: z.boolean(),
    armazens: z.array(z.string()),
    canais: z.array(z.string()),
    pedidos: contagem,
    notas: contagem,
    linhas: contagem,
    clientes: contagem,
    primeira_venda: z.string().nullable(),
    ultima_venda: z.string().nullable(),
    quantidade: numero,
    receita: dinheiro,
    desconto: dinheiro,
    receita_liquida: dinheiro,
    custo: dinheiro,
    margem: dinheiro,
    margem_liquida: dinheiro,
    margem_pct: numero,
    margem_liquida_pct: numero,
    /** Receita e custo por unidade no periodo — o par que explica a margem. */
    preco_medio: dinheiro,
    custo_medio: dinheiro,
    itens_fora_do_kpi: contagem,
    linhas_fora_do_recorte: contagem,
  }),
  /** Uma linha por (pedido, nota): o mesmo pedido pode faturar em mais de uma. */
  pedidos: z.array(
    z.object({
      chave: z.string(),
      origem: z.enum(["pedido", "pdv"]),
      num_pedido: z.string().nullable(),
      nota_fiscal: z.string().nullable(),
      serie_nf: z.string().nullable(),
      emissao: z.string().nullable(),
      competencia: z.string().nullable(),
      cod_cliente: z.string().nullable(),
      nome_cliente: z.string().nullable(),
      canal: z.string(),
      vendedor_codigo: z.string().nullable(),
      vendedor_nome: z.string().nullable(),
      armazem: z.string().nullable(),
      armazem_rotulo: z.string().nullable(),
      linhas: contagem,
      quantidade: numero,
      vlr_unitario: dinheiro,
      receita_bruta: dinheiro,
      desconto: dinheiro,
      receita_liquida: dinheiro,
      custo_unitario_ref: dinheiro,
      origem_custo: z
        .enum(["saida", "medio", "ultima_compra", "outro_armazem"])
        .nullable(),
      custo_total: dinheiro,
      margem_bruta: dinheiro,
      margem_liquida: dinheiro,
      margem_pct: numero,
      sem_custo: z.boolean(),
      outlier_custo: z.boolean(),
      tes_receita: z.boolean(),
    }),
  ),
  /** Quem vendeu o item. Nao e ranking (Regra 1): Marketplace entra com
   *  `vendedor_codigo` nulo, porque o codigo 72 e canal, nao pessoa. */
  vendedores: z.array(
    z.object({
      vendedor_codigo: z.string().nullable(),
      vendedor_nome: z.string().nullable(),
      pedidos: contagem,
      quantidade: numero,
      receita: dinheiro,
      margem: dinheiro,
      margem_pct: numero,
    }),
  ),
  /** Estoque e compras saem do staging, que nao tem `vendedor_codigo` — sem
   *  coluna nao ha escopo aplicavel, entao o perfil `vendedor` recebe listas
   *  vazias e `suprimentos_visiveis: false`. */
  suprimentos_visiveis: z.boolean(),
  estoque: z.array(
    z.object({
      armazem: z.string().nullable(),
      armazem_rotulo: z.string().nullable(),
      saldo_atual: numero,
      saldo_disponivel: numero,
      custo_unitario: dinheiro,
      /** `V. Ult. Comp` do SB2: valor da ultima compra, sem data. A data so
       *  existe no SD1 (lista `compras`). */
      vlr_ult_compra: dinheiro,
      dt_carga: z.string().nullable(),
    }),
  ),
  compras: z.array(
    z.object({
      dt_emissao: z.string().nullable(),
      documento: z.string().nullable(),
      serie: z.string().nullable(),
      /** Codigo do fornecedor: o SD1 nao traz o nome. */
      forn_cliente: z.string().nullable(),
      loja: z.string().nullable(),
      armazem: z.string().nullable(),
      quantidade: numero,
      vlr_unitario: dinheiro,
      custo_total: dinheiro,
    }),
  ),
  escopo: escopoSchema,
});
export type DetalheSku = z.infer<typeof skuDetalheSchema>;
export type CabecalhoSku = DetalheSku["sku"];
export type PedidoDoSku = DetalheSku["pedidos"][number];
export type VendedorDoSku = DetalheSku["vendedores"][number];
export type EstoqueSku = DetalheSku["estoque"][number];
export type CompraSku = DetalheSku["compras"][number];
