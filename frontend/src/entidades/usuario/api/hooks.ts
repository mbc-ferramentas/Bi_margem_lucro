import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { buscar, escrever } from "@compartilhado/api/cliente";
import { detalheSchema } from "@compartilhado/api/primitivas";
import { usuarioSchema, usuariosSchema, type FormularioUsuario } from "../modelo/tipos";

export function useUsuarios() {
  return useQuery({
    queryKey: ["usuarios"],
    queryFn: () => buscar("/usuarios", usuariosSchema),
  });
}

/** Cria ou edita. Sem `id` e criacao — e so na criacao que a senha e obrigatoria.
 *
 *  Invalida apenas a lista: nada aqui muda os numeros do BI. A excecao e o
 *  proprio usuario logado, cujo perfil vem de /auth/eu — por isso `eu` tambem
 *  cai fora do cache. */
export function useSalvarUsuario() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dados }: FormularioUsuario & { id?: number }) =>
      id
        ? escrever(`/usuarios/${id}`, "PATCH", dados, usuarioSchema)
        : escrever("/usuarios", "POST", dados, usuarioSchema),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ["usuarios"] });
      cliente.invalidateQueries({ queryKey: ["eu"] });
    },
  });
}

export function useRemoverUsuario() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      escrever(`/usuarios/${id}`, "DELETE", undefined, z.null()),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ["usuarios"] }),
  });
}

/** Reset feito pelo admin: nao pede a senha atual, porque o caso de uso e
 *  exatamente o de quem a esqueceu. */
export function useRedefinirSenha() {
  return useMutation({
    mutationFn: ({ id, senha }: { id: number; senha: string }) =>
      escrever(`/usuarios/${id}/senha`, "POST", { senha }, detalheSchema),
  });
}
