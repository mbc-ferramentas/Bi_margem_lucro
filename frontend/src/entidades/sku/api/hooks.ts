import { useQuery } from "@tanstack/react-query";

import { buscar, paraQuery } from "@compartilhado/api/cliente";
import type { Filtros } from "@compartilhado/api/filtros";
import { skuDetalheSchema, skusSchema } from "../modelo/tipos";

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

/** Um SKU aberto em pedidos, notas e vendedores — o drill-down de `Por SKU`. */
export function useSku(
  sku: string,
  f: Filtros,
  ordenar: string,
  offset: number,
  limite: number,
) {
  return useQuery({
    queryKey: ["sku", sku, f, ordenar, offset, limite],
    queryFn: () =>
      buscar(
        `/margem/sku/${encodeURIComponent(sku)}${paraQuery({
          ...f,
          ordenar,
          limite: String(limite),
          offset: String(offset),
        } as Filtros)}`,
        skuDetalheSchema,
      ),
  });
}
