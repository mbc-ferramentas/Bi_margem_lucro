/** Aritmetica do periodo: janela efetiva, janela anterior e granularidade.
 *
 *  O recorte do BI e um intervalo de datas (`data_inicio`/`data_fim`, em ISO
 *  AAAA-MM-DD), e nao mais um par de competencias. Duas coisas dependem disso e
 *  moram aqui, longe da rede e do React:
 *
 *  1. A Visao geral compara o recorte atual com o periodo anterior de mesmo
 *     tamanho — a API nao tem endpoint de comparativo, mas responde `/kpis` para
 *     qualquer janela.
 *  2. O grafico escolhe sozinho entre dia, semana e mes: quatro meses em
 *     granularidade diaria viram um grafico ilegivel, e um unico mes agregado por
 *     mes vira uma barra so.
 *
 *  Tudo em dias inteiros desde a epoca. Somar dia em `Date` local seria mais
 *  curto e erraria por fuso: `new Date("2026-01-01")` e UTC, e em BRT volta para
 *  31/12.
 */

import type { Filtros, Granularidade } from "./api/tipos";

const MS_POR_DIA = 86_400_000;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export type Janela = { inicio: string; fim: string };

/** "AAAA-MM-DD" -> dias desde a epoca. Ordenavel e subtraivel. */
function paraDia(data: string): number {
  const [ano, mes, dia] = data.split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia) / MS_POR_DIA;
}

function paraData(dias: number): string {
  return new Date(dias * MS_POR_DIA).toISOString().slice(0, 10);
}

function valida(data: string | undefined): data is string {
  return Boolean(data) && DATA.test(data as string);
}

/** Quantos dias a janela cobre, contando as duas pontas. */
export function tamanhoEmDias(janela: Janela): number {
  return paraDia(janela.fim) - paraDia(janela.inicio) + 1;
}

/** A janela que o recorte atual realmente cobre.
 *
 *  Filtro aberto de um lado (ou dos dois) cai para o extremo do que existe na
 *  base — sem isso, a tela sem filtro nenhum, que e como ela abre, nunca teria
 *  comparativo. `base` e o `opcoes.periodo` de `/filtros`, ja recortado pelo
 *  escopo do usuario. */
export function janelaEfetiva(
  filtros: Filtros,
  base?: { inicio: string | null; fim: string | null } | null,
): Janela | null {
  const inicio = filtros.data_inicio ?? base?.inicio ?? undefined;
  const fim = filtros.data_fim ?? base?.fim ?? undefined;
  if (!valida(inicio) || !valida(fim)) return null;
  if (paraDia(inicio) > paraDia(fim)) return null;
  return { inicio, fim };
}

/** Os mesmos filtros, deslocados para a janela anterior de igual comprimento.
 *
 *  Julho compara com junho; 15/06..15/07 compara com os 31 dias que terminam em
 *  14/06. As demais dimensoes (canal, armazem, grupo, vendedor) seguem intactas:
 *  mudar duas coisas ao mesmo tempo tornaria a variacao ilegivel.
 *
 *  Devolve `null` quando nao da para saber a janela — a tela entao simplesmente
 *  nao mostra variacao, em vez de inventar uma base de comparacao. */
export function periodoAnterior(
  filtros: Filtros,
  base?: { inicio: string | null; fim: string | null } | null,
): Filtros | null {
  const janela = janelaEfetiva(filtros, base);
  if (!janela) return null;

  const dias = tamanhoEmDias(janela);
  const fimAnterior = paraDia(janela.inicio) - 1;
  return {
    ...filtros,
    data_inicio: paraData(fimAnterior - dias + 1),
    data_fim: paraData(fimAnterior),
  };
}

/** "01/07/2026 a 15/08/2026", ou "15/08/2026" quando a janela tem um dia so. */
export function rotuloJanela(filtros: Filtros): string | null {
  const { data_inicio: inicio, data_fim: fim } = filtros;
  if (!valida(inicio) || !valida(fim)) return null;
  const formatar = (d: string) => d.split("-").reverse().join("/");
  return inicio === fim ? formatar(inicio) : `${formatar(inicio)} a ${formatar(fim)}`;
}

/** Ate quantos dias cada granularidade continua legivel no eixo do tempo.
 *
 *  Sao tetos de quantidade de pontos, nao regra de negocio: ~45 barras diarias e
 *  ~27 semanais e o limite em que o rotulo do eixo ainda cabe na largura util do
 *  grafico. */
const TETO_AUTOMATICO: Record<Granularidade, number> = {
  dia: 45,
  semana: 186,
  mes: Infinity,
};

/** Teto de tolerancia para a escolha manual do usuario: ele pode pedir mais
 *  detalhe do que o automatico daria, mas nao ao ponto de o grafico virar uma
 *  mancha. */
const TETO_MANUAL: Record<Granularidade, number> = {
  dia: 92,
  semana: 400,
  mes: Infinity,
};

const ORDEM: readonly Granularidade[] = ["dia", "semana", "mes"];

/** A granularidade que a janela pede quando ninguem escolheu nada. */
export function granularidadeAuto(janela: Janela | null): Granularidade {
  if (!janela) return "mes";
  const dias = tamanhoEmDias(janela);
  return ORDEM.find((g) => dias <= TETO_AUTOMATICO[g]) ?? "mes";
}

/** As granularidades que a janela comporta — as demais ficam desabilitadas no
 *  alternador, em vez de sumir: a lista muda de tamanho a cada troca de periodo,
 *  e um botao que se move e mais confuso que um botao apagado. */
export function granularidadesPermitidas(janela: Janela | null): Granularidade[] {
  if (!janela) return [...ORDEM];
  const dias = tamanhoEmDias(janela);
  return ORDEM.filter((g) => dias <= TETO_MANUAL[g]);
}

/** O que o grafico realmente pede a API.
 *
 *  A escolha do usuario vale enquanto couber na janela: quem marcou "dia" e
 *  depois abriu o filtro para o ano inteiro nao quer 365 barras — quer o mesmo
 *  grafico legivel, e sem esse limite a tela travava por conta do volume. */
export function granularidadeEfetiva(
  janela: Janela | null,
  escolhida: Granularidade | null,
): Granularidade {
  const automatica = granularidadeAuto(janela);
  if (!escolhida) return automatica;
  return granularidadesPermitidas(janela).includes(escolhida) ? escolhida : automatica;
}
