import { useQuery } from "@tanstack/react-query";

import { buscar, paraQuery } from "@compartilhado/api/cliente";
import type { Filtros } from "@compartilhado/api/filtros";
import { pedidoSchema, pedidosSchema } from "../modelo/tipos";

/** Pedidos faturados do drill-down de `Por armazem`. O armazem entra como mais um
 *  filtro: a rota so decide o que a tela mostra, o recorte continua sendo o mesmo
 *  de todas as telas de margem. */
export function usePedidos(
  f: Filtros,
  ordenar: string,
  offset: number,
  limite: number,
) {
  return useQuery({
    queryKey: ["pedidos", f, ordenar, offset, limite],
    queryFn: () =>
      buscar(
        `/margem/pedidos${paraQuery({
          ...f,
          ordenar,
          limite: String(limite),
          offset: String(offset),
        } as Filtros)}`,
        pedidosSchema,
      ),
  });
}

/** Um pedido. Os filtros seguem junto de proposito: o detalhe mostra o mesmo
 *  recorte da lista, e informa quantas linhas ficaram de fora dele. */
export function usePedido(chave: string, f: Filtros) {
  return useQuery({
    queryKey: ["pedido", chave, f],
    queryFn: () =>
      buscar(
        `/margem/pedidos/${encodeURIComponent(chave)}${paraQuery(f)}`,
        pedidoSchema,
      ),
  });
}
