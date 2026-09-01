/** Filtros de tela guardados na URL, e nao em `useState`.
 *
 *  O drill-down (`Por armazem` -> pedidos -> detalhe) so funciona se o recorte
 *  sobreviver a navegacao: com o estado em memoria, voltar do detalhe devolveria
 *  a tela sem periodo nem grupo, e o usuario reconstruiria o filtro toda vez.
 *  De quebra, a tela vira linkavel — mandar "olha o Barracao 02 em julho" passa
 *  a ser copiar a barra de enderecos.
 *
 *  O formato e o mesmo que `paraQuery` ja escreve (grupo separado por virgula),
 *  entao a URL da tela e a URL da chamada da API falam a mesma lingua.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import type { Filtros } from "./api/tipos";

const SIMPLES = [
  "competencia_inicio",
  "competencia_fim",
  "canal",
  "armazem",
  "vendedor",
  "busca",
] as const;

export function lerFiltros(params: URLSearchParams): Filtros {
  const filtros: Filtros = {};
  for (const chave of SIMPLES) {
    const valor = params.get(chave);
    if (valor) filtros[chave] = valor;
  }
  const grupo = params.get("grupo");
  if (grupo) filtros.grupo = grupo.split(",").filter(Boolean);
  const situacao = params.get("situacao");
  if (situacao === "atrasados" || situacao === "a_vencer") filtros.situacao = situacao;
  return filtros;
}

/** Serializa para query string sem o `?` — pronto para compor um `to` de `Link`. */
export function escreverFiltros(filtros: Filtros): string {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (Array.isArray(valor)) {
      if (valor.length) params.set(chave, valor.join(","));
    } else if (valor) {
      params.set(chave, valor);
    }
  }
  return params.toString();
}

export function useFiltrosUrl(): [Filtros, (f: Filtros) => void] {
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => lerFiltros(params), [params]);

  const definir = useCallback(
    (novos: Filtros) => {
      // `replace`: mudar de filtro nao e navegacao. Sem isso o botao de voltar
      // do browser percorreria cada select que o usuario tocou antes de sair
      // da tela.
      const seguintes = new URLSearchParams(params);
      for (const chave of [...SIMPLES, "grupo", "situacao"]) seguintes.delete(chave);
      const filtrosSerializados = new URLSearchParams(escreverFiltros(novos));
      filtrosSerializados.forEach((valor, chave) => seguintes.set(chave, valor));
      setParams(seguintes, { replace: true });
    },
    [params, setParams],
  );

  return [filtros, definir];
}

/** Estado de interface compartilhavel sem misturar `aba` aos filtros da API. */
export function useAbaUrl<T extends string>(
  validas: readonly T[],
  padrao: T,
): [T, (aba: T) => void] {
  const [params, setParams] = useSearchParams();
  const bruta = params.get("aba");
  const aba = validas.includes(bruta as T) ? (bruta as T) : padrao;

  const definir = useCallback(
    (nova: T) => {
      const seguintes = new URLSearchParams(params);
      if (nova === padrao) seguintes.delete("aba");
      else seguintes.set("aba", nova);
      setParams(seguintes, { replace: true });
    },
    [padrao, params, setParams],
  );
  return [aba, definir];
}
