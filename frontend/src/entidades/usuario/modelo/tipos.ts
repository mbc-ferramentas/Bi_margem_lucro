import { z } from "zod";
import type { Perfil } from "@compartilhado/config";

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

export type FormularioUsuario = {
  username: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  vendedor_codigo: string;
  senha?: string;
};
