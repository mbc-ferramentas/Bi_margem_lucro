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
import { useEffect, useRef } from "react";

import type { EChartsOption } from "echarts";

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  SVGRenderer,
]);

export const SERIES = [
  "--series-1",
  "--series-2",
  "--series-3",
  "--series-4",
] as const;

export function corDaSerie(indice: number): string {
  const estilo = getComputedStyle(document.documentElement);
  return estilo.getPropertyValue(SERIES[indice % SERIES.length]).trim();
}

function token(nome: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

export function baseDoTema() {
  return {
    textStyle: { fontFamily: "system-ui, -apple-system, sans-serif" },
    grid: { left: 8, right: 24, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "line" as const, lineStyle: { color: token("--axis") } },
      backgroundColor: token("--surface-1"),
      borderColor: token("--border"),
      textStyle: { color: token("--text-primary"), fontSize: 12 },
    },
    legend: {
      top: 0,
      left: 0,
      icon: "roundRect",
      itemWidth: 9,
      itemHeight: 9,
      itemGap: 16,
      textStyle: { color: token("--text-secondary"), fontSize: 12 },
    },
    xAxis: {
      axisLine: { lineStyle: { color: token("--axis") } },
      axisTick: { show: false },
      axisLabel: { color: token("--text-muted"), fontSize: 11 },
      splitLine: { show: false },
    },
    yAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: token("--text-muted"), fontSize: 11 },
      splitLine: { lineStyle: { color: token("--grid"), width: 1 } },
    },
  };
}

type Props = {
  opcao: EChartsOption;
  altura?: number;
  rotuloAcessivel: string;
};

export function Grafico({ opcao, altura = 300, rotuloAcessivel }: Props) {
  const alvo = useRef<HTMLDivElement>(null);
  const instancia = useRef<echarts.ECharts>();

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
