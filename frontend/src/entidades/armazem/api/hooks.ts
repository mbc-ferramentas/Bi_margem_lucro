import { useQuery } from "@tanstack/react-query";

import { buscar, paraQuery } from "@compartilhado/api/cliente";
import type { Filtros } from "@compartilhado/api/filtros";
import { armazensSchema } from "../modelo/tipos";

export function useArmazens(f: Filtros, ordenar: string) {
  return useQuery({
    queryKey: ["armazens", f, ordenar],
    queryFn: () =>
      buscar(
        `/margem/armazem${paraQuery({ ...f, ordenar } as Filtros)}`,
        armazensSchema,
      ),
  });
}
