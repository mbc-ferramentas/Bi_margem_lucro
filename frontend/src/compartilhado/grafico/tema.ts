/** A paleta e a moldura dos graficos, separadas do componente.
 *
 *  Estavam no mesmo arquivo do wrapper do ECharts, e as paginas importavam dali
 *  tanto o componente quanto as funcoes de cor. Separado, quem so precisa de uma
 *  cor nao arrasta o wrapper — e a paleta validada fica num arquivo que se le
 *  inteiro. */

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
