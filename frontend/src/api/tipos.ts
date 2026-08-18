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

export const serieSchema = z.object({
  granularidade: z.enum(["dia", "mes"]),
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

export const filtrosSchema = z.object({
  opcoes: z.object({
    canais: z.array(z.string()),
    grupos: z.array(z.object({ codigo: z.string(), rotulo: z.string().nullable() })),
    armazens: z.array(z.string().nullable()),
    vendedores: z.array(
      z.object({ codigo: z.string(), nome: z.string().nullable() }),
    ),
    /** Tipos de saida presentes no periodo. `conta_como_venda` reflete o cadastro
     *  em MapaTES: false marca remessa/bonificacao, fora do KPI de margem. */
    tes: z.array(
      z.object({ codigo: z.string(), conta_como_venda: z.boolean() }),
    ),
    competencias: z.array(z.string()),
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
    grupos: z.array(z.object({ codigo: z.string(), rotulo: z.string().nullable() })),
    armazens: z.array(z.string().nullable()),
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
  /** Na carteira estas duas recortam a **data de entrega**, nao a competencia:
   *  a view nao tem competencia, e o que interessa la e o prazo prometido. */
  competencia_inicio?: string;
  competencia_fim?: string;
  canal?: string;
  grupo?: string;
  armazem?: string;
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
