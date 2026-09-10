/** Formatacao pt-BR.
 *
 *  A API entrega valores monetarios como string (Decimal serializado como texto,
 *  para nao perder centavos). A conversao para Number acontece so aqui, na borda
 *  de exibicao — nunca em calculo.
 */

import type { Granularidade } from "@compartilhado/config";

const MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const MOEDA_CURTA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

const PERCENTUAL = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

type Valor = string | number | null | undefined;

function paraNumero(valor: Valor): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function moeda(valor: Valor): string {
  const n = paraNumero(valor);
  return n === null ? "—" : MOEDA.format(n);
}

export function moedaCurta(valor: Valor): string {
  const n = paraNumero(valor);
  return n === null ? "—" : MOEDA_CURTA.format(n);
}

export function inteiro(valor: Valor): string {
  const n = paraNumero(valor);
  return n === null ? "—" : INTEIRO.format(n);
}

/** A API entrega margem como fracao (0.258444), nao como 25.8. */
export function percentual(valor: Valor): string {
  const n = paraNumero(valor);
  return n === null ? "—" : PERCENTUAL.format(n);
}

export function numeroBruto(valor: Valor): number {
  return paraNumero(valor) ?? 0;
}

export function competencia(iso: string): string {
  const [ano, mes] = iso.split("-");
  return `${mes}/${ano}`;
}

/** "2026-07-01" -> "01/07/2026". A data cheia, para quando o ano importa —
 *  filtro de periodo e chips, onde `dataCurta` (ano com 2 digitos) ficaria
 *  ambigua. */
export function dataLonga(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** "01/07/2026 – 15/08/2026", com travessao. Rotulo do seletor de periodo. */
export function intervaloData(inicio?: string, fim?: string): string | null {
  if (!inicio && !fim) return null;
  if (inicio && fim) return `${dataLonga(inicio)} – ${dataLonga(fim)}`;
  return inicio ? `A partir de ${dataLonga(inicio)}` : `Até ${dataLonga(fim as string)}`;
}

const MESES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

/** Rotulo do ponto no eixo do tempo, conforme a agregacao do grafico.
 *
 *  Dia e semana viram "01/07" (a semana e rotulada pela segunda-feira, que e o
 *  que o date_trunc do Postgres devolve); mes vira "jul/26". O nome do mes se le
 *  de relance; "07/2026" obriga a decodificar dois numeros, e ao lado de "01/07"
 *  no eixo diario o mesmo par de digitos significava coisas diferentes. O ano
 *  vai junto porque a serie mensal costuma atravessar a virada. */
export function rotuloPeriodo(iso: string, granularidade: Granularidade): string {
  const [ano, mes, dia] = iso.split("-");
  return granularidade === "mes" ? `${MESES[Number(mes) - 1]}/${ano.slice(2)}` : `${dia}/${mes}`;
}

/** Os rotulos do eixo do tempo, na ordem dos periodos.
 *
 *  Semana vira "S1", "S2"... numeradas **dentro do recorte**: a data da segunda
 *  ("06/07") nao diz ao leitor que aquilo e uma semana, e a semana ISO do ano
 *  ("S28") nao casa com o que ele acabou de filtrar. A data cheia continua no
 *  tooltip e na tabela, que e onde alguem vai atras dela. */
export function rotulosDoPeriodo(
  periodos: readonly string[],
  granularidade: Granularidade,
): string[] {
  if (granularidade === "semana") return periodos.map((_, i) => `S${i + 1}`);
  return periodos.map((p) => rotuloPeriodo(p, granularidade));
}

export function dataCurta(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano.slice(2)}`;
}

/** Nota fiscal como "1234/1": numero e serie juntos, porque o numero sozinho nao
 *  e unico — a serie 1 e a venda com pedido e a 2 e o balcao. */
export function rotuloNota(numero: string | null, serie: string | null): string | null {
  if (!numero) return null;
  return serie ? `${numero}/${serie}` : numero;
}
