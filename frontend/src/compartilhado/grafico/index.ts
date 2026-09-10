/** Porta de entrada da camada de grafico. As paginas montam `EChartsOption` e
 *  precisam do tipo: reexportado aqui para que nenhuma tela importe `echarts`
 *  direto, como as quatro que faziam isso antes. */

export type { EChartsOption } from "echarts";

export { Grafico, Sparkline } from "./Grafico";
export { SERIES, baseDoTema, corDaSerie, token } from "./tema";
export { useOpcaoGrafico } from "./useOpcaoGrafico";
