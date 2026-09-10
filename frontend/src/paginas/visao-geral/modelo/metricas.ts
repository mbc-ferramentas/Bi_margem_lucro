/** As constantes da Visao geral: o que cada metrica mede e quanto cabe num
 *  cartao antes de virar tabela. */

import { moeda, numeroBruto, percentual } from "@compartilhado/lib/formato";
import type { Granularidade } from "@compartilhado/config";

/** `numeroBruto` devolve 0 para nulo, o que serve para somar e atrapalha para
 *  comparar: variação contra uma base ausente não é queda de 100%, é ausência
 *  de comparação. */
export function valorOuNulo(valor: string | number | null | undefined): number | null {
  return valor === null || valor === undefined ? null : numeroBruto(valor);
}

export type Metrica = "margem" | "margem_pct" | "receita";

export const METRICAS: Record<Metrica, { rotulo: string; formatar: (v: number) => string }> = {
  margem: { rotulo: "Margem R$", formatar: moeda },
  margem_pct: { rotulo: "Margem %", formatar: (v) => percentual(v) },
  receita: { rotulo: "Receita", formatar: moeda },
};

/** Quantos armazéns e quantos SKUs cabem em um cartão de resumo antes de virarem
 *  uma tabela mal disfarçada. Quem precisa da lista inteira tem o link ao lado. */
export const TOPO_ARMAZEM = 6;
export const TOPO_SKU = 5;

/** Cabecalho da primeira coluna da tabela da serie: o que cada linha representa
 *  muda com a agregacao. */
export const ROTULO_PERIODO: Record<Granularidade, string> = {
  dia: "Dia",
  semana: "Semana",
  mes: "Competência",
};
