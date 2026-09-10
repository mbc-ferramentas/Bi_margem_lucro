import { useMutation, useQueryClient } from "@tanstack/react-query";

import { enviar } from "@compartilhado/api/cliente";
import { uploadsSchema } from "../modelo/tipos";

/** Carga dos CSVs do Protheus. Sincrona: a promessa so resolve quando o ETL
 *  terminou, por isso a tela precisa exibir estado de processamento.
 *
 *  Ao concluir, invalida tudo — a carga reescreve as materialized views, entao
 *  qualquer numero em cache na tela passou a estar desatualizado. */
export function useUploads() {
  const cliente = useQueryClient();
  return useMutation({
    // A tela chama-se Uploads, mas o endpoint continua /carga: o caminho da API
    // nao aparece para o usuario e renomea-lo custaria migracao de contrato.
    mutationFn: (arquivos: FormData) =>
      enviar("/carga", arquivos, uploadsSchema),
    onSuccess: () => cliente.invalidateQueries(),
  });
}
