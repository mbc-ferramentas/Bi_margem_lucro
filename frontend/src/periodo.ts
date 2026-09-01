/** Janela de competencia e a janela imediatamente anterior a ela.
 *
 *  A Visao geral compara o recorte atual com o periodo anterior de mesmo
 *  tamanho, e essa conta e feita no cliente: a API nao tem endpoint de
 *  comparativo, mas responde `/kpis` para qualquer janela. O que mora aqui e so
 *  a aritmetica de competencia — testavel sem rede e sem React.
 *
 *  Competencia e sempre "AAAA-MM". Somar mes em `Date` seria mais curto e
 *  erraria por fuso: `new Date("2026-01")` e UTC, e em BRT volta para dezembro.
 */

import type { Filtros } from "./api/tipos";

/** "AAAA-MM" -> numero de meses desde o ano 0. Ordenavel e subtraivel. */
function paraIndice(competencia: string): number {
  const [ano, mes] = competencia.split("-").map(Number);
  return ano * 12 + (mes - 1);
}

function paraCompetencia(indice: number): string {
  const ano = Math.floor(indice / 12);
  const mes = (indice % 12) + 1;
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}`;
}

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A janela que o recorte atual realmente cobre.
 *
 *  Filtro aberto de um lado (ou dos dois) cai para o extremo do que existe na
 *  base — sem isso, a tela sem filtro nenhum, que e como ela abre, nunca teria
 *  comparativo. `competencias` vem de `/filtros`, ja recortada pelo escopo do
 *  usuario. */
export function janelaEfetiva(
  filtros: Filtros,
  competencias: readonly string[],
): { inicio: string; fim: string } | null {
  const conhecidas = competencias.filter((c) => COMPETENCIA.test(c)).sort();
  const inicio = filtros.competencia_inicio ?? conhecidas[0];
  const fim = filtros.competencia_fim ?? conhecidas[conhecidas.length - 1];
  if (!inicio || !fim || !COMPETENCIA.test(inicio) || !COMPETENCIA.test(fim)) return null;
  if (paraIndice(inicio) > paraIndice(fim)) return null;
  return { inicio, fim };
}

/** Os mesmos filtros, deslocados para a janela anterior de igual comprimento.
 *
 *  Julho..julho compara com junho; abril..julho compara com dezembro..marco. As
 *  demais dimensoes (canal, armazem, grupo, vendedor) seguem intactas: mudar
 *  duas coisas ao mesmo tempo tornaria a variacao ilegivel.
 *
 *  Devolve `null` quando nao da para saber a janela — a tela entao simplesmente
 *  nao mostra variacao, em vez de inventar uma base de comparacao. */
export function periodoAnterior(
  filtros: Filtros,
  competencias: readonly string[],
): Filtros | null {
  const janela = janelaEfetiva(filtros, competencias);
  if (!janela) return null;

  const meses = paraIndice(janela.fim) - paraIndice(janela.inicio) + 1;
  return {
    ...filtros,
    competencia_inicio: paraCompetencia(paraIndice(janela.inicio) - meses),
    competencia_fim: paraCompetencia(paraIndice(janela.inicio) - 1),
  };
}

/** "04/2026 a 07/2026", ou "07/2026" quando a janela tem um mes so. */
export function rotuloJanela(filtros: Filtros): string | null {
  const { competencia_inicio: inicio, competencia_fim: fim } = filtros;
  if (!inicio || !fim) return null;
  const formatar = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;
  return inicio === fim ? formatar(inicio) : `${formatar(inicio)} a ${formatar(fim)}`;
}
