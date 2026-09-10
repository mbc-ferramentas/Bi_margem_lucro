import { useQuery } from "@tanstack/react-query";

import { buscar, paraQuery } from "@compartilhado/api/cliente";
import type { Filtros } from "@compartilhado/api/filtros";
import { filtrosSchema } from "../modelo/tipos";

/** As opcoes sao recortadas pelos filtros ativos (cascata armazem > grupo), por
 *  isso os filtros entram na chave: sem eles a lista ficaria congelada na
 *  primeira consulta e o select de grupo nunca reagiria ao armazem. */
export function useOpcoes(f: Filtros = {}) {
  return useQuery({
    queryKey: ["filtros", f],
    queryFn: () => buscar(`/filtros${paraQuery(f)}`, filtrosSchema),
    staleTime: 5 * 60 * 1000,
  });
}
