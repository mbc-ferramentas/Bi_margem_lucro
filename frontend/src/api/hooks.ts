import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { buscar, enviar, paraQuery } from "./cliente";
import {
  euSchema,
  filtrosSchema,
  kpisSchema,
  serieSchema,
  skusSchema,
  uploadsSchema,
  vendedoresSchema,
  type Filtros,
} from "./tipos";

export function useEu() {
  return useQuery({
    queryKey: ["eu"],
    queryFn: () => buscar("/auth/eu", euSchema),
    staleTime: Infinity,
  });
}

export function useKpis(f: Filtros) {
  return useQuery({
    queryKey: ["kpis", f],
    queryFn: () => buscar(`/kpis${paraQuery(f)}`, kpisSchema),
  });
}

export function useSerie(f: Filtros, granularidade: "dia" | "mes") {
  return useQuery({
    queryKey: ["serie", f, granularidade],
    queryFn: () =>
      buscar(
        `/margem/serie${paraQuery({ ...f, granularidade } as Filtros)}`,
        serieSchema,
      ),
  });
}

export function useVendedores(f: Filtros, ordenar: string) {
  return useQuery({
    queryKey: ["vendedores", f, ordenar],
    queryFn: () =>
      buscar(
        `/margem/vendedor${paraQuery({ ...f, ordenar } as Filtros)}`,
        vendedoresSchema,
      ),
  });
}

export function useSkus(f: Filtros, ordenar: string, offset: number, limite: number) {
  return useQuery({
    queryKey: ["skus", f, ordenar, offset, limite],
    queryFn: () =>
      buscar(
        `/margem/sku${paraQuery({
          ...f,
          ordenar,
          limite: String(limite),
          offset: String(offset),
        } as Filtros)}`,
        skusSchema,
      ),
  });
}

export function useOpcoes() {
  return useQuery({
    queryKey: ["filtros"],
    queryFn: () => buscar("/filtros", filtrosSchema),
    staleTime: 5 * 60 * 1000,
  });
}

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
