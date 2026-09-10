import { useMemo } from "react";

import { useTema } from "@compartilhado/lib/tema";

import type { EChartsOption } from "echarts";

/** Memoiza a opcao do grafico ja incluindo o tema resolvido nas dependencias.
 *
 *  Isso existe porque `baseDoTema()` e `token()` leem `getComputedStyle`: sao
 *  valores capturados no momento do render, nao referencias vivas. Um `useMemo`
 *  que esquecesse o tema deixaria o grafico com as cores do modo anterior ate
 *  algum outro filtro mudar — um bug que so aparece ao alternar claro/escuro, e
 *  que ja custou caro. Com este hook nao da para esquecer. */
export function useOpcaoGrafico<T extends EChartsOption = EChartsOption>(
  fabrica: () => T,
  deps: unknown[],
): T {
  const { resolvido } = useTema();
  // A lista dinamica de dependencias e justamente o que este hook oferece: quem
  // chama passa as suas deps e o tema entra por conta propria. As duas regras
  // abaixo pedem uma lista literal, que aqui seria impossivel.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  return useMemo(fabrica, [...deps, resolvido]);
}
