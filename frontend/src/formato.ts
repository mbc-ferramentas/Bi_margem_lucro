/** Formatacao pt-BR.
 *
 *  A API entrega valores monetarios como string (Decimal serializado como texto,
 *  para nao perder centavos). A conversao para Number acontece so aqui, na borda
 *  de exibicao — nunca em calculo.
 */

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
