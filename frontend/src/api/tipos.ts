import { z } from "zod";

/** Valores monetarios chegam como string: a API serializa Decimal como texto
 *  para nao perder centavos em float. Converta so na exibicao. */
const dinheiro = z.string().nullable();
const numero = z.union([z.string(), z.number()]).nullable();
/** Contagens sao inteiras, mas sum() no Postgres devolve numeric — que o renderer
 *  serializa como texto. Aceita as duas formas e entrega number. */
const contagem = z.coerce.number();

export const escopoSchema = z.object({
  tipo: z.literal("margem_bruta"),
  rotulo: z.string(),
  formula: z.string(),
  nao_inclui: z.array(z.string()),
  aviso_marketplace: z.string(),
  comparacao_entre_canais: z.literal(false),
});
export type Escopo = z.infer<typeof escopoSchema>;

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

/** Como o eixo do tempo e agregado. Espelha `GRANULARIDADE_COLUNA` em
 *  apps/api/queries.py — a semana e a segunda-feira do date_trunc do Postgres. */
export const GRANULARIDADES = ["dia", "semana", "mes"] as const;
export type Granularidade = (typeof GRANULARIDADES)[number];

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

export const filtrosSchema = z.object({
  opcoes: z.object({
    canais: z.array(z.string()),
    /** Armazem e a dimensao de fora da hierarquia: a lista de grupos ja vem
     *  recortada pelo armazem selecionado. */
    armazens: z.array(z.object({ codigo: z.string(), rotulo: z.string().nullable() })),
    /** Grupo lista tambem o que so existe no cadastro: `sem_movimento` marca o
     *  grupo classificado que nao tem linha no recorte atual. */
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
    /** Tipos de saida presentes no periodo. `conta_como_venda` reflete o cadastro
     *  em MapaTES: false marca remessa/bonificacao, fora do KPI de margem. */
    tes: z.array(
      z.object({ codigo: z.string(), conta_como_venda: z.boolean() }),
    ),
    /** Extremos do que existe na base (ISO AAAA-MM-DD), ja recortados pelo
     *  escopo do usuario. Limitam o calendario e dizem qual e a janela real
     *  quando o filtro de periodo esta aberto — e o que sustenta a comparacao
     *  com o periodo anterior na Visao geral. */
    periodo: z.object({
      inicio: z.string().nullable(),
      fim: z.string().nullable(),
    }),
  }),
  escopo: escopoSchema,
});

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


export const euSchema = z.object({
  username: z.string(),
  nome: z.string(),
  perfis: z.array(z.string()),
  vendedor: z
    .object({ codigo: z.string(), nome: z.string() })
    .nullable(),
});
export type Eu = z.infer<typeof euSchema>;

export const uploadsSchema = z.object({
  arquivos: z.array(
    z.object({
      arquivo: z.string(),
      status: z.string(),
      linhas_lidas: z.number(),
      linhas_gravadas: z.number(),
      competencia: z.string().nullable(),
      mensagem: z.string(),
    }),
  ),
});
export type Uploads = z.infer<typeof uploadsSchema>;
export type ResultadoArquivo = Uploads["arquivos"][number];

export type Filtros = {
  /** Intervalo de datas em ISO (AAAA-MM-DD), inclusivo nas duas pontas. Nas
   *  telas de margem recorta a **emissao**; na carteira, a **data de entrega** —
   *  a view nao tem competencia, e o que interessa la e o prazo prometido. */
  data_inicio?: string;
  data_fim?: string;
  canal?: string;
  /** Multi-selecao: grupo e armazem sao marcadores, nao selects de escolha
   *  unica. Vazio = todos. A API aceita `?grupo=A,B` e `?armazem=01,02` desde
   *  sempre (apps/api/filtros.py). */
  grupo?: string[];
  armazem?: string[];
  vendedor?: string;
  /** Exclusivos da carteira. */
  situacao?: "atrasados" | "a_vencer";
  busca?: string;
};

/** Perfis do BI. A API aceita um unico perfil por conta — 'gerente + vendedor'
 *  nao significa nada, porque o escopo mais amplo engole o outro. */
export const PERFIS = ["admin", "gerente", "vendedor"] as const;
export type Perfil = (typeof PERFIS)[number];

export const usuarioSchema = z.object({
  id: z.number(),
  username: z.string(),
  nome: z.string(),
  email: z.string(),
  perfil: z.string(),
  ativo: z.boolean(),
  /** Conta administrativa de emergencia: aparece na lista, mas nao aceita
   *  alteracao, remocao nem troca de senha pela aplicacao. */
  protegido: z.boolean(),
  ultimo_acesso: z.string().nullable(),
  vendedor: z.object({ codigo: z.string(), nome: z.string() }).nullable(),
});
export type Usuario = z.infer<typeof usuarioSchema>;

export const usuariosSchema = z.object({
  usuarios: z.array(usuarioSchema),
  vendedores: z.array(
    z.object({
      codigo: z.string(),
      nome: z.string(),
      /** Ja vinculado a esta conta — o formulario marca para nao oferecer duas
       *  vezes o mesmo codigo. */
      usuario: z.string().nullable(),
    }),
  ),
});

export const detalheSchema = z.object({ detail: z.string() });

export type FormularioUsuario = {
  username: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  vendedor_codigo: string;
  senha?: string;
};
