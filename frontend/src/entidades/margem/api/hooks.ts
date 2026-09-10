import { useQuery } from "@tanstack/react-query";

import { buscar, paraQuery } from "@compartilhado/api/cliente";
import type { Filtros } from "@compartilhado/api/filtros";
import type { Granularidade } from "@compartilhado/config";
import { kpisSchema, serieSchema } from "../modelo/tipos";

/** `ativo` existe para a comparacao com o periodo anterior: a Visao geral so
 *  sabe qual e a janela anterior depois que `/filtros` respondeu, e disparar a
 *  consulta antes disso traria os KPIs da base inteira — um comparativo errado,
 *  que apareceria por um instante na tela antes de se corrigir. */
export function useKpis(f: Filtros, ativo = true) {
  return useQuery({
    queryKey: ["kpis", f],
    queryFn: () => buscar(`/kpis${paraQuery(f)}`, kpisSchema),
    enabled: ativo,
  });
}

export function useSerie(f: Filtros, granularidade: Granularidade) {
  return useQuery({
    queryKey: ["serie", f, granularidade],
    queryFn: () =>
      buscar(
        `/margem/serie${paraQuery({ ...f, granularidade } as Filtros)}`,
        serieSchema,
      ),
  });
}
