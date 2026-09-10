import { useQuery } from "@tanstack/react-query";

import { buscar } from "@compartilhado/api/cliente";
import { euSchema } from "../modelo/tipos";

export function useEu() {
  return useQuery({
    queryKey: ["eu"],
    queryFn: () => buscar("/auth/eu", euSchema),
    staleTime: Infinity,
  });
}
