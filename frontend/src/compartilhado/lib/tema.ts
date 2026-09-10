/** Preferencia de tema do usuario.
 *
 *  O tema efetivo e publicado de duas formas na raiz do documento:
 *  a classe `.dark`, que e o que o Tailwind e todos os componentes do shadcn
 *  enxergam, e o `color-scheme`, que manda nos controles nativos e na barra de
 *  rolagem. O modo "sistema" nao e um terceiro valor publicado: ele e resolvido
 *  aqui, contra o `prefers-color-scheme`, e reavaliado quando o SO muda.
 *
 *  O primeiro frame nao passa por aqui — quem o pinta e o script inline no
 *  <head> do index.html, que repete esta leitura. Sem ele a tela piscaria clara
 *  antes do bundle carregar.
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

function resolver(tema: Tema): "claro" | "escuro" {
  if (tema !== "sistema") return tema;
  return window.matchMedia(ESCURO).matches ? "escuro" : "claro";
}

function aplicar(tema: Tema) {
  const raiz = document.documentElement;
  const efetivo = resolver(tema);
  raiz.classList.toggle("dark", efetivo === "escuro");
  raiz.style.colorScheme = efetivo === "escuro" ? "dark" : "light";
}

/** Chamado uma vez em main.tsx, antes do render. Alem de aplicar a preferencia
 *  salva, registra o ouvinte de modulo do prefers-color-scheme: no modo
 *  "sistema" quem troca o tema e o SO, e a classe precisa acompanhar mesmo que
 *  nenhum componente esteja assinando o store. */
export function iniciarTema() {
  aplicar(atual);
  window.matchMedia(ESCURO).addEventListener("change", () => {
    if (atual === "sistema") aplicar(atual);
  });
}

export function definirTema(tema: Tema) {
  atual = tema;
  if (tema === "sistema") localStorage.removeItem(CHAVE);
  else localStorage.setItem(CHAVE, tema);
  // Aplicar antes de avisar: os graficos leem os tokens com getComputedStyle no
  // proprio render, entao a classe tem que estar na raiz quando eles rodarem.
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
