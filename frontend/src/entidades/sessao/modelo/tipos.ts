import { z } from "zod";

export const euSchema = z.object({
  username: z.string(),
  nome: z.string(),
  perfis: z.array(z.string()),
  vendedor: z
    .object({ codigo: z.string(), nome: z.string() })
    .nullable(),
});
export type Eu = z.infer<typeof euSchema>;
