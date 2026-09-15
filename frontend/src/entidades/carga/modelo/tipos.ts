import { z } from "zod";

export const uploadsSchema = z.object({
  arquivos: z.array(
    z.object({
      // Id da auditoria gravada: e o que liga o resultado ao "Ver detalhes".
      id: z.coerce.number(),
      arquivo: z.string(),
      status: z.string(),
      linhas_lidas: z.coerce.number(),
      linhas_gravadas: z.coerce.number(),
      competencia: z.string().nullable(),
      mensagem: z.string(),
    }),
  ),
});
export type Uploads = z.infer<typeof uploadsSchema>;
export type ResultadoArquivo = Uploads["arquivos"][number];

export const execucaoCargaSchema = z.object({
  id: z.number(),
  lote: z.string().nullable(),
  arquivo: z.string(),
  status: z.string(),
  origem: z.string(),
  usuario: z.string().nullable(),
  criado_em: z.string(),
  competencia: z.string().nullable(),
  competencias: z.array(z.string()),
  linhas_lidas: z.number(),
  linhas_gravadas: z.number(),
  duracao_ms: z.number(),
  alertas: z.number(),
  mensagem: z.string(),
});
export type ExecucaoCarga = z.infer<typeof execucaoCargaSchema>;

export const listaCargasSchema = z.object({
  total: z.number(),
  limite: z.number(),
  offset: z.number(),
  linhas: z.array(execucaoCargaSchema),
});
export type ListaCargas = z.infer<typeof listaCargasSchema>;

/** Metricas da limpeza. Todas opcionais: execucoes anteriores a auditoria nao as
 *  tem, e um arquivo que falha cedo so preenche as primeiras. */
export const auditoriaCargaSchema = z.object({
  linhas_brutas: z.number().optional(),
  colunas_ausentes: z.array(z.string()).optional(),
  opcionais_ausentes: z.array(z.string()).optional(),
  descartadas_obrigatorias: z.number().optional(),
  colunas_obrigatorias: z.array(z.string()).optional(),
  numeros_invalidos: z.record(z.string(), z.number()).optional(),
  datas_invalidas: z.record(z.string(), z.number()).optional(),
  sem_competencia: z.number().optional(),
  duplicatas_removidas: z.number().optional(),
  linhas_quantidade_zero: z.number().optional(),
  divergencia_aritmetica: z
    .object({ linhas: z.number(), proporcao: z.number(), limite: z.number() })
    .optional(),
  estrategia: z.string().optional(),
  linhas_substituidas: z.number().optional(),
});
export type AuditoriaCarga = z.infer<typeof auditoriaCargaSchema>;

export const detalheCargaSchema = execucaoCargaSchema.extend({
  nome_original: z.string(),
  tamanho_bytes: z.number(),
  sha256: z.string(),
  dt_carga: z.string(),
  caminho_parquet: z.string(),
  auditoria: auditoriaCargaSchema,
  avisos: z.array(z.string()),
  mesmo_lote: z.array(z.object({ id: z.number(), arquivo: z.string(), status: z.string() })),
});
export type DetalheCarga = z.infer<typeof detalheCargaSchema>;
