import { useQuery } from "@tanstack/react-query";

import { buscar, paraQuery } from "@compartilhado/api/cliente";
import type { Filtros } from "@compartilhado/api/filtros";
import { vendedoresSchema } from "../modelo/tipos";

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
