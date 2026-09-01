/** Wrapper do ECharts com o tema do BI.
 *
 *  Decisoes que vem do metodo de dataviz e nao devem ser desfeitas:
 *  - marcas finas (linha 2px, marcador 8px), grade recessiva;
 *  - cores categoricas em ordem fixa, nunca cicladas;
 *  - legenda sempre presente com 2+ series, mais rotulo direto na ponta;
 *  - eixo unico — nunca dois eixos y com escalas diferentes;
 *  - tooltip com crosshair por padrao.
 */

// Importacao seletiva: o ECharts completo custa ~1 MB no bundle, e este BI usa
// apenas linha e barra. Registrar so o necessario derruba o pacote para ~1/3.
import { BarChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useMemo, useRef } from "react";

import { useTema } from "../tema";

import type { EChartsOption } from "echarts";

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  SVGRenderer,
]);

/** Slots categoricos, na ordem fixa validada. A ordem e o mecanismo de
 *  seguranca para daltonismo — nao e enfeite. Ciclar para uma sexta serie e
 *  proibido: agrupe em "Outros" ou quebre em pequenos multiplos. */
export const SERIES = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
] as const;

/** Le um token da raiz ja resolvido. O SVGRenderer do ECharts nao resolve
 *  `var(--x)` dentro de uma string de cor — passar "var(--grid)" direto para a
 *  opcao produz uma marca sem cor, silenciosamente. Sempre passe por aqui. */
export function token(nome: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

export function corDaSerie(indice: number): string {
  return token(SERIES[indice % SERIES.length]);
}

export function baseDoTema() {
  return {
    textStyle: { fontFamily: "inherit" },
    grid: { left: 8, right: 24, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "line" as const, lineStyle: { color: token("--axis") } },
      backgroundColor: token("--popover"),
      borderColor: token("--border"),
      textStyle: { color: token("--popover-foreground"), fontSize: 12 },
    },
    legend: {
      top: 0,
      left: 0,
      icon: "roundRect",
      itemWidth: 9,
      itemHeight: 9,
      itemGap: 16,
      textStyle: { color: token("--muted-foreground"), fontSize: 12 },
    },
    xAxis: {
      axisLine: { lineStyle: { color: token("--axis") } },
      axisTick: { show: false },
      axisLabel: { color: token("--muted-foreground"), fontSize: 11 },
      splitLine: { show: false },
    },
    yAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: token("--muted-foreground"), fontSize: 11 },
      splitLine: { lineStyle: { color: token("--grid"), width: 1 } },
    },
  };
}

/** Memoiza a opcao do grafico ja incluindo o tema resolvido nas dependencias.
 *
 *  Isso existe porque `baseDoTema()` e `token()` leem `getComputedStyle`: sao
 *  valores capturados no momento do render, nao referencias vivas. Um `useMemo`
 *  que esquecesse o tema deixaria o grafico com as cores do modo anterior ate
 *  algum outro filtro mudar — um bug que so aparece ao alternar claro/escuro, e
 *  que ja custou caro. Com este hook nao da para esquecer. */
export function useOpcaoGrafico<T extends EChartsOption = EChartsOption>(
  fabrica: () => T,
  deps: unknown[],
): T {
  const { resolvido } = useTema();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(fabrica, [...deps, resolvido]);
}

type Props = {
  opcao: EChartsOption;
  altura?: number;
  rotuloAcessivel: string;
};

export function Grafico({ opcao, altura = 300, rotuloAcessivel }: Props) {
  const alvo = useRef<HTMLDivElement>(null);
  // O `undefined` explicito e exigencia dos tipos do React 19: useRef sem
  // argumento nao existe mais.
  const instancia = useRef<echarts.ECharts | undefined>(undefined);

  useEffect(() => {
    if (!alvo.current) return;
    // SVG: nitido em qualquer densidade de tela e imprimivel sem serrilhado.
    instancia.current = echarts.init(alvo.current, undefined, { renderer: "svg" });

    const aoRedimensionar = () => instancia.current?.resize();
    window.addEventListener("resize", aoRedimensionar);
    return () => {
      window.removeEventListener("resize", aoRedimensionar);
      instancia.current?.dispose();
    };
  }, []);

  useEffect(() => {
    instancia.current?.setOption(opcao, true);
  }, [opcao]);

  return (
    <div
      ref={alvo}
      style={{ height: altura, width: "100%" }}
      role="img"
      aria-label={rotuloAcessivel}
    />
  );
}
