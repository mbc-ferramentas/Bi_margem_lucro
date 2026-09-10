import { z } from "zod";

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
