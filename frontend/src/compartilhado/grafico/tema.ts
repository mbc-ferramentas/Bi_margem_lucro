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

/** Gradiente vertical suave a partir da cor da serie, para dar volume a barra e
 *  a area sob a linha sem inventar uma segunda cor. A opacidade cai, o matiz
 *  nunca muda — quem le continua identificando a serie pelo mesmo slot. */
export function degradeDaSerie(
  indice: number,
  /** A direcao acompanha o crescimento da barra: numa barra horizontal um
   *  degrade vertical atravessaria a espessura, que e o lado que nao significa
   *  nada. */
  direcao: "vertical" | "horizontal" = "vertical",
  deOpacidade = 1,
  ateOpacidade = 0.55,
) {
  const cor = corDaSerie(indice);
  const horizontal = direcao === "horizontal";
  return {
    type: "linear" as const,
    x: horizontal ? 1 : 0,
    y: 0,
    x2: 0,
    y2: horizontal ? 0 : 1,
    colorStops: [
      { offset: 0, color: comOpacidade(cor, deOpacidade) },
      { offset: 1, color: comOpacidade(cor, ateOpacidade) },
    ],
  };
}

/** `color-mix` nao serve aqui: o SVGRenderer nao resolve funcao de cor do CSS.
 *  Como os tokens sao oklch, a opacidade entra pela sintaxe `/ alpha` do proprio
 *  oklch, que o navegador ja entrega resolvida em `getComputedStyle`. */
function comOpacidade(cor: string, alfa: number): string {
  if (alfa >= 1) return cor;
  return cor.startsWith("oklch(") ? `${cor.slice(0, -1)} / ${alfa})` : cor;
}

export function baseDoTema() {
  return {
    textStyle: { fontFamily: "inherit" },
    // O movimento e curto e desacelerando: informa que o dado trocou sem fazer
    // o leitor esperar. Acima de ~500ms vira espera; o padrao do ECharts (1s,
    // com atraso por ponto) deixava a tela "montando" a cada filtro.
    animationDuration: 450,
    animationEasing: "cubicOut" as const,
    animationDurationUpdate: 300,
    animationEasingUpdate: "cubicOut" as const,
    grid: { left: 8, right: 24, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "line" as const, lineStyle: { color: token("--axis") } },
      backgroundColor: token("--popover"),
      borderColor: token("--border"),
      borderRadius: 10,
      padding: [8, 12],
      // Mesma elevacao dos cartoes: o tooltip e uma superficie flutuante da
      // mesma familia, nao uma caixa de outro sistema.
      extraCssText: "box-shadow: 0 8px 24px -8px rgb(0 0 0 / 0.28);",
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
      // Sem linha de eixo: a grade horizontal ja da o piso da leitura, e duas
      // molduras competindo com a marca e exatamente o excesso que o metodo
      // manda tirar.
      axisLine: { show: false },
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
