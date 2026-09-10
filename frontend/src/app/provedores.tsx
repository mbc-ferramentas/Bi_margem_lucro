/** Os provedores que envolvem a aplicacao inteira.
 *
 *  Fora do `main.tsx` porque a politica de retry e uma decisao de comportamento
 *  — nao de inicializacao — e vale a pena poder le-la sem atravessar o
 *  bootstrap do React. */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ErroApi } from "@compartilhado/api/cliente";

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      // 401 e 403 sao decisao do servidor sobre permissao: repetir nao ajuda e
      // ainda mascara um cadastro incompleto de vendedor.
      retry: (tentativas, erro) =>
        erro instanceof ErroApi && [401, 403, 400].includes(erro.status)
          ? false
          : tentativas < 2,
    },
  },
});

export function Provedores({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}
