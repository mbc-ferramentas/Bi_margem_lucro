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
  MarkLineComponent,
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
  // A linha de media do ranking de vendedores depende dele. Sem o registro o
  // ECharts ignora `markLine` em silencio — a media simplesmente nao aparecia.
  MarkLineComponent,
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
      // O tooltip sai do container e vai para o <body>. Dentro do cartao ele e
      // um filho absoluto de uma caixa `overflow-hidden` com cantos
      // arredondados: mover essa caixa a cada pixel do mouse fazia o navegador
      // deixar de repintar o SVG por baixo, e o grafico "sumia" no rastro do
      // cursor, mostrando o fundo do cartao.
      appendTo: () => document.body,
      // Sem a animacao de deslizar: e ela que arrasta a area suja do repaint
      // junto com o ponteiro. O tooltip aparece direto no lugar certo.
      transitionDuration: 0,
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
  /** Clique numa marca. Recebe o `name` da categoria e o indice da serie — o
   *  bastante para montar um drill-down sem acoplar o wrapper ao ECharts. */
  aoClicar?: (marca: { nome: string; serie: number; indice: number }) => void;
};

export function Grafico({ opcao, altura = 300, rotuloAcessivel, aoClicar }: Props) {
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

  // Efeito proprio, e nao dentro do de inicializacao: `aoClicar` costuma ser
  // uma closure sobre os filtros da tela e muda a cada recorte. Registrar uma
  // vez so levaria o clique para o filtro que estava valendo na montagem.
  useEffect(() => {
    const grafico = instancia.current;
    if (!grafico || !aoClicar) return;
    const ouvinte = (params: { name: string; seriesIndex?: number; dataIndex: number }) =>
      aoClicar({
        nome: params.name,
        serie: params.seriesIndex ?? 0,
        indice: params.dataIndex,
      });
    grafico.on("click", ouvinte);
    return () => {
      grafico.off("click", ouvinte);
    };
  }, [aoClicar]);

  return (
    <div
      ref={alvo}
      // `translateZ(0)` promove o SVG a uma camada de composicao propria. Sem
      // isso o Chromium nao repinta o SVG por baixo do tooltip (um filho
      // absoluto do <body>) enquanto ele se move: a barra longa que fica sob a
      // caixa do tooltip some inteira ao passar o mouse. Com a camada propria o
      // grafico se repinta independente do que passa por cima.
      style={{ height: altura, width: "100%", transform: "translateZ(0)" }}
      role="img"
      aria-label={rotuloAcessivel}
      className={aoClicar ? "cursor-pointer" : undefined}
    />
  );
}

/** Faixa de tendencia para dentro de um cartao: sem eixo, sem grade, sem
 *  tooltip.
 *
 *  E contexto, nao leitura de valor — quem precisa do numero de um mes tem o
 *  grafico grande e a tabela logo abaixo. Por isso ela nao ganha rotulo de
 *  ponto nem legenda: seria informacao ilegivel a 40px de altura.
 *
 *  Serie unica, entao a cor e sempre o slot 1: aqui a cor nao identifica nada,
 *  so desenha a linha. */
export function Sparkline({
  valores,
  rotuloAcessivel,
  altura = 40,
}: {
  valores: readonly number[];
  rotuloAcessivel: string;
  altura?: number;
}) {
  const opcao = useOpcaoGrafico<EChartsOption>(() => {
    const cor = corDaSerie(0);
    return {
      animation: false,
      grid: { left: 1, right: 1, top: 4, bottom: 2, containLabel: false },
      xAxis: { type: "category", show: true, boundaryGap: false, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      yAxis: { type: "value", show: false, scale: true, splitLine: { show: false } },
      series: [
        {
          type: "line",
          // O ultimo ponto ganha marcador: e o valor que o numero grande do
          // cartao esta mostrando, e sem ele a linha parece cortada na borda.
          // Feito no proprio dado, e nao com `markPoint`, para nao arrastar mais
          // um componente do ECharts para dentro do bundle.
          data: valores.map((valor, i) => ({
            value: valor,
            symbolSize: i === valores.length - 1 ? 5 : 0,
          })),
          smooth: false,
          symbol: "circle",
          itemStyle: { color: cor },
          lineStyle: { width: 2, color: cor },
          areaStyle: { color: cor, opacity: 0.12 },
        },
      ],
    };
  }, [valores]);

  if (valores.length < 2) return null;
  return <Grafico opcao={opcao} altura={altura} rotuloAcessivel={rotuloAcessivel} />;
}
