import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { buscar, enviar } from "@compartilhado/api/cliente";
import { detalheCargaSchema, listaCargasSchema, uploadsSchema } from "../modelo/tipos";

/** Carga dos CSVs do Protheus. Sincrona: a promessa so resolve quando o ETL
 *  terminou, por isso a tela precisa exibir estado de processamento.
 *
 *  Ao concluir, invalida tudo — a carga reescreve as materialized views, entao
 *  qualquer numero em cache na tela passou a estar desatualizado (e o historico
 *  de importacoes ganha as linhas novas pelo mesmo caminho). */
export function useUploads() {
  const cliente = useQueryClient();
  return useMutation({
    // A tela chama-se Uploads, mas o endpoint continua /carga: o caminho da API
    // nao aparece para o usuario e renomea-lo custaria migracao de contrato.
    mutationFn: (arquivos: FormData) => enviar("/carga", arquivos, uploadsSchema),
    onSuccess: () => cliente.invalidateQueries(),
    // A falha nao mexe nos numeros, mas grava auditoria: so o historico muda.
    onError: () => cliente.invalidateQueries({ queryKey: ["cargas"] }),
  });
}

export function useCargas(limite: number, offset: number) {
  return useQuery({
    queryKey: ["cargas", limite, offset],
    queryFn: () => buscar(`/cargas?limite=${limite}&offset=${offset}`, listaCargasSchema),
    placeholderData: keepPreviousData,
  });
}

export function useCarga(id: number | null) {
  return useQuery({
    queryKey: ["cargas", "detalhe", id],
    queryFn: () => buscar(`/cargas/${id}`, detalheCargaSchema),
    enabled: id !== null,
  });
}
