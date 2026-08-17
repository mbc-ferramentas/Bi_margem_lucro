/** Preferencia de tema do usuario.
 *
 *  O styles.css ja traz as tres camadas de paleta: :root (claro), o
 *  @media (prefers-color-scheme: dark) e o override :root[data-theme="dark"].
 *  Este modulo so decide qual delas vale, escrevendo (ou removendo) o atributo
 *  data-theme na raiz. Remover o atributo e o que devolve a palavra ao sistema
 *  operacional — por isso "sistema" apaga em vez de escrever algum valor.
 */

import { useSyncExternalStore } from "react";

export type Tema = "sistema" | "claro" | "escuro";

const CHAVE = "bi.tema";
const ESCURO = "(prefers-color-scheme: dark)";

function lido(): Tema {
  const bruto = localStorage.getItem(CHAVE);
  return bruto === "claro" || bruto === "escuro" ? bruto : "sistema";
}

let atual: Tema = lido();
const ouvintes = new Set<() => void>();

function avisar() {
  for (const ouvinte of ouvintes) ouvinte();
}

function aplicar(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === "sistema") raiz.removeAttribute("data-theme");
  else raiz.setAttribute("data-theme", tema === "escuro" ? "dark" : "light");
}

/** Chamado uma vez em main.tsx, antes do render: se o data-theme so fosse
 *  escrito depois da primeira pintura, quem escolheu claro num Windows escuro
 *  veria a tela piscar preta a cada carregamento. */
export function iniciarTema() {
  aplicar(atual);
}

export function definirTema(tema: Tema) {
  atual = tema;
  if (tema === "sistema") localStorage.removeItem(CHAVE);
  else localStorage.setItem(CHAVE, tema);
  aplicar(tema);
  avisar();
}

function assinar(aoMudar: () => void) {
  ouvintes.add(aoMudar);
  // No modo "sistema" a resposta certa muda sem ninguem clicar em nada: se o
  // Windows alterna sozinho ao anoitecer, os graficos precisam recolorir junto.
  const consulta = window.matchMedia(ESCURO);
  consulta.addEventListener("change", aoMudar);
  return () => {
    ouvintes.delete(aoMudar);
    consulta.removeEventListener("change", aoMudar);
  };
}

/** Chave estavel para o useSyncExternalStore: precisa ser uma string, e nao um
 *  objeto novo a cada leitura, senao o React entra em loop de render. */
function instantaneo(): string {
  return `${atual}|${window.matchMedia(ESCURO).matches ? "escuro" : "claro"}`;
}

export function useTema() {
  const estado = useSyncExternalStore(assinar, instantaneo, () => "sistema|claro");
  const [tema, doSistema] = estado.split("|") as [Tema, "claro" | "escuro"];
  return {
    tema,
    definirTema,
    /** Modo que esta valendo de fato — ja com o "sistema" resolvido. */
    resolvido: tema === "sistema" ? doSistema : tema,
  };
}
