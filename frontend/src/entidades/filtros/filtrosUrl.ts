/** Filtros de tela guardados na URL, e nao em `useState`.
 *
 *  O drill-down (`Por armazem` -> pedidos -> detalhe) so funciona se o recorte
 *  sobreviver a navegacao: com o estado em memoria, voltar do detalhe devolveria
 *  a tela sem periodo nem grupo, e o usuario reconstruiria o filtro toda vez.
 *  De quebra, a tela vira linkavel — mandar "olha o Barracao 02 em julho" passa
 *  a ser copiar a barra de enderecos.
 *
 *  O formato e o mesmo que `paraQuery` ja escreve (grupo, armazem e vendedor
 *  separados por virgula),
 *  entao a URL da tela e a URL da chamada da API falam a mesma lingua.
 */

import { Filtros } from "@compartilhado/api/filtros";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import { mesAtual, ultimoDiaDoMes } from "./modelo/periodo";


const SIMPLES = ["data_inicio", "data_fim", "canal", "busca"] as const;

/** Nomes antigos do periodo, de quando o filtro era competencia mensal. A API
 *  ainda os aceita (apps/api/filtros.py); aqui eles sao lidos e reescritos nos
 *  nomes novos para que um link ja compartilhado continue abrindo com recorte —
 *  e nao em branco. */
const ALIAS: Record<string, (typeof SIMPLES)[number]> = {
  competencia_inicio: "data_inicio",
  competencia_fim: "data_fim",
};

/** Dimensoes multi-valor: na URL vao separadas por virgula, do mesmo jeito que
 *  `paraQuery` escreve para a API. */
const LISTAS = ["grupo", "armazem", "vendedor"] as const;

/** Marca na URL a escolha explicita de "Todo o periodo".
 *
 *  Sem periodo na URL a tela abre no mes corrente (ver `mesAtual`), entao a
 *  ausencia de datas nao pode mais significar "sem recorte" — precisaria de um
 *  sinal proprio, ou o botao "Todo o periodo" seria desfeito pelo padrao no
 *  quadro seguinte. */
const SEM_RECORTE = "periodo";

export function lerFiltros(params: URLSearchParams): Filtros {
  const filtros: Filtros = {};
  for (const chave of SIMPLES) {
    const valor = params.get(chave);
    if (valor) filtros[chave] = valor;
  }
  for (const [antigo, novo] of Object.entries(ALIAS)) {
    const valor = params.get(antigo);
    // Competencia sem dia: o inicio e o dia 1, o fim e o mes inteiro — a mesma
    // regra do parser da API.
    if (valor && !filtros[novo]) {
      filtros[novo] = /^\d{4}-\d{2}$/.test(valor)
        ? novo === "data_inicio"
          ? `${valor}-01`
          : ultimoDiaDoMes(valor)
        : valor;
    }
  }
  for (const chave of LISTAS) {
    const bruto = params.get(chave);
    if (bruto) filtros[chave] = bruto.split(",").filter(Boolean);
  }
  // O padrao do periodo mora aqui, e nao em cada tela: `useFiltrosUrl` e o unico
  // caminho pelo qual filtro chega a uma pagina.
  if (!filtros.data_inicio && !filtros.data_fim && params.get(SEM_RECORTE) !== "tudo") {
    const mes = mesAtual();
    filtros.data_inicio = mes.inicio;
    filtros.data_fim = mes.fim;
  }
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
      for (const chave of [
        ...SIMPLES,
        ...LISTAS,
        ...Object.keys(ALIAS),
        "situacao",
        SEM_RECORTE,
      ]) {
        seguintes.delete(chave);
      }
      // Limpar as duas datas e um pedido de historico completo, nao um retorno
      // ao padrao: fica gravado para sobreviver ao recarregamento.
      if (!novos.data_inicio && !novos.data_fim) seguintes.set(SEM_RECORTE, "tudo");
      const filtrosSerializados = new URLSearchParams(escreverFiltros(novos));
      filtrosSerializados.forEach((valor, chave) => seguintes.set(chave, valor));
      setParams(seguintes, { replace: true });
    },
    [params, setParams],
  );

  return [filtros, definir];
}

/** Escolha opcional guardada na URL, fora dos filtros da API.
 *
 *  `null` significa "ninguem escolheu" — e nao um valor padrao qualquer. E o que
 *  a granularidade do grafico precisa: sem escolha ela acompanha o tamanho da
 *  janela, e so para de acompanhar quando o usuario clica. */
export function useEscolhaUrl<T extends string>(
  chave: string,
  validas: readonly T[],
): [T | null, (valor: T | null) => void] {
  const [params, setParams] = useSearchParams();
  const bruto = params.get(chave);
  const valor = validas.includes(bruto as T) ? (bruto as T) : null;

  const definir = useCallback(
    (seguinte: T | null) => {
      const seguintes = new URLSearchParams(params);
      if (seguinte) seguintes.set(chave, seguinte);
      else seguintes.delete(chave);
      setParams(seguintes, { replace: true });
    },
    [chave, params, setParams],
  );
  return [valor, definir];
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
