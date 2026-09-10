import { useQuery } from "@tanstack/react-query";

import { buscar, paraQuery } from "@compartilhado/api/cliente";
import type { Filtros } from "@compartilhado/api/filtros";
import { carteiraFiltrosSchema, carteiraSchema } from "../modelo/tipos";

export function useCarteira(
  f: Filtros,
  ordenar: string,
  offset: number,
  limite: number,
) {
  return useQuery({
    queryKey: ["carteira", f, ordenar, offset, limite],
    queryFn: () =>
      buscar(
        `/carteira${paraQuery({
          ...f,
          ordenar,
          limite: String(limite),
          offset: String(offset),
        } as Filtros)}`,
        carteiraSchema,
      ),
  });
}

/** Filtros proprios da carteira: os valores diferem dos da margem, porque a
 *  carteira tem pedidos fora da janela do SD2. */
export function useOpcoesCarteira(f: Filtros = {}) {
  return useQuery({
    queryKey: ["carteira-filtros", f],
    queryFn: () => buscar(`/carteira/filtros${paraQuery(f)}`, carteiraFiltrosSchema),
    staleTime: 5 * 60 * 1000,
  });
}
