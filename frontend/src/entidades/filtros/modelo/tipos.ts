import { z } from "zod";
import { escopoSchema } from "@compartilhado/api/primitivas";

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
