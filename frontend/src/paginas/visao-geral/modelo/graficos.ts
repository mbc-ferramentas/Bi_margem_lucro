/** As tres opcoes de ECharts da Visao geral.
 *
 *  Fora do componente porque sao 200 linhas de configuracao que nao dependem de
 *  estado de React — dentro da pagina, faziam o corpo dela ter mais desenho de
 *  grafico do que composicao de tela. Cada uma recebe tudo o que usa: quem
 *  chama continua passando por `useOpcaoGrafico`, que e o que injeta o tema
 *  resolvido nas dependencias. */

import {
  baseDoTema,
  corDaSerie,
  token,
  type EChartsOption,
} from "@compartilhado/grafico";
import {
  moeda,
  moedaCurta,
  numeroBruto,
  percentual,
} from "@compartilhado/lib/formato";
import type { Granularidade } from "@compartilhado/config";
import {
  fatiaDoPeriodo,
  rotuloJanela,
  type Janela,
} from "@entidades/filtros";
import type { PontoSerie } from "@entidades/margem";
import type { ItemSku } from "@entidades/sku";

import type { TotalArmazem } from "./agregacoes";
import { METRICAS, valorOuNulo, type Metrica } from "./metricas";

export function opcaoEvolucao({
  canais,
  periodos,
  rotulos,
  serie,
  metrica,
  granularidade,
  janela,
}: {
  canais: string[];
  periodos: string[];
  rotulos: string[];
  serie: readonly PontoSerie[];
  metrica: Metrica;
  granularidade: Granularidade;
  janela: Janela | null;
}): EChartsOption {
    const base = baseDoTema();
    const { formatar } = METRICAS[metrica];
    const eixo = metrica === "margem_pct" ? (v: number) => percentual(v) : moedaCurta;
    return {
      ...base,
      color: canais.map((_, i) => corDaSerie(i)),
      legend: { ...base.legend, data: canais },
      tooltip: {
        ...base.tooltip,
        // Formatter proprio, e nao `valueFormatter`: com "S1" no eixo, o
        // cabecalho padrao do tooltip perderia a unica pista de **qual** semana
        // esta sob o cursor. Aqui ele carrega a data junto.
        formatter: (params: unknown) => {
          const pontos = params as {
            dataIndex: number;
            seriesName: string;
            marker: string;
            value: number | null;
          }[];
          const indice = pontos[0]?.dataIndex ?? 0;
          const fatia = fatiaDoPeriodo(periodos[indice], granularidade, janela);
          const intervalo = rotuloJanela({ data_inicio: fatia.inicio, data_fim: fatia.fim });
          const cabecalho =
            granularidade === "semana" && intervalo
              ? `${rotulos[indice]} · ${intervalo}`
              : rotulos[indice];
          const linhas = pontos
            .filter((x) => x.value !== null && x.value !== undefined)
            .map((x) => `${x.marker}${x.seriesName}: ${formatar(x.value as number)}`);
          return [cabecalho, ...linhas].join("<br/>");
        },
      },
      xAxis: { ...base.xAxis, type: "category", data: rotulos },
      yAxis: {
        ...base.yAxis,
        type: "value",
        // Eixo unico sempre: trocar de metrica troca a escala inteira. Margem
        // em R$ e margem em % nunca dividem o mesmo desenho.
        axisLabel: { ...base.yAxis.axisLabel, formatter: (v: number) => eixo(v) },
      },
      series: canais.map((canal, i) => ({
        name: canal,
        type: "line" as const,
        smooth: false,
        symbolSize: 8,
        lineStyle: { width: 2 },
        // Rotulo direto na ponta: exigido pela regra de relevo, porque tres tons
        // da paleta ficam abaixo de 3:1 no modo claro.
        endLabel: {
          show: true,
          formatter: canal,
          color: corDaSerie(i),
          fontSize: 11,
          distance: 6,
        },
        // Sem `focus: "series"`: com o tooltip por eixo, apontar um ponto
        // aplicava blur em todas as outras series ao mesmo tempo em que o
        // tooltip listava os valores delas. Na pratica as linhas somiam sob o
        // cursor e sobrava so a grade — e a informacao que o usuario queria
        // comparar era justamente a que desaparecia.
        emphasis: { focus: "none" as const },
        data: periodos.map((p) => {
          const ponto = serie.find((x) => x.periodo === p && x.canal === canal);
          return ponto ? valorOuNulo(ponto[metrica]) : null;
        }),
      })),
    };
}

export function opcaoArmazens(porArmazem: readonly TotalArmazem[]): EChartsOption {
    const base = baseDoTema();
    // A barra `category` do ECharts cresce de baixo para cima.
    const ordenados = [...porArmazem].reverse();
    return {
      ...base,
      // Faixa livre a direita dimensionada para o rotulo direto ("R$ 6,9 mi\u00a0\u00a025,8%"),
      // que e a alternativa acessivel a leitura pelo eixo: cortado, ele nao serve.
      grid: { ...base.grid, right: 112, top: 8 },
      legend: { show: false },
      tooltip: { ...base.tooltip, valueFormatter: (v) => moeda(v as number) },
      xAxis: {
        ...base.xAxis,
        type: "value",
        axisLabel: { ...base.xAxis.axisLabel, formatter: (v: number) => moedaCurta(v) },
        splitLine: { lineStyle: { color: token("--grid") } },
      },
      yAxis: {
        ...base.yAxis,
        type: "category",
        data: ordenados.map((a) => a.rotulo),
        splitLine: { show: false },
      },
      series: [
        {
          name: "Margem bruta",
          type: "bar" as const,
          barMaxWidth: 18,
          // Uma cor so: aqui a cor nao identifica armazem nenhum, o eixo faz
          // isso. Pintar cada barra de um tom seria gastar o unico canal livre
          // repetindo o que o comprimento ja diz.
          itemStyle: { color: corDaSerie(0), borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: "right" as const,
            color: token("--muted-foreground"),
            fontSize: 11,
            formatter: (p: { dataIndex: number }) => {
              const item = ordenados[p.dataIndex];
              const pct = item.receita ? item.margem / item.receita : null;
              return `${moedaCurta(item.margem)}  ${percentual(pct)}`;
            },
          },
          data: ordenados.map((a) => a.margem),
        },
      ],
    };
}

export function opcaoDeSkus(extremos: readonly ItemSku[]): EChartsOption {
    const base = baseDoTema();
    const positiva = corDaSerie(0);
    // A cor de status aqui significa estado ruim de verdade — e o mesmo uso que
    // a tabela faz em `negativo`. O sinal vai junto no rotulo, entao a leitura
    // nunca depende so da cor.
    const negativa = token("--status-critico");
    return {
      ...base,
      // Assimetrico de proposito: a esquerda so precisa caber o codigo do SKU
      // (eixo), porque o rotulo do valor negativo foi para o lado do zero, e
      // nao mais para a ponta esquerda da barra — onde colidia com o codigo. A
      // direita fica larga para o rotulo das barras positivas.
      grid: { ...base.grid, left: 52, right: 112, top: 8 },
      legend: { show: false },
      tooltip: { ...base.tooltip, valueFormatter: (v) => moeda(v as number) },
      xAxis: {
        ...base.xAxis,
        type: "value",
        axisLabel: { ...base.xAxis.axisLabel, formatter: (v: number) => moedaCurta(v) },
        splitLine: { lineStyle: { color: token("--grid") } },
      },
      yAxis: {
        ...base.yAxis,
        type: "category",
        data: extremos.map((i) => i.sku),
        splitLine: { show: false },
      },
      series: [
        {
          name: "Margem bruta",
          type: "bar" as const,
          barMaxWidth: 16,
          label: {
            show: true,
            position: "right" as const,
            color: token("--muted-foreground"),
            fontSize: 11,
            formatter: (p: { dataIndex: number }) =>
              `${moedaCurta(numeroBruto(extremos[p.dataIndex].margem))}  ${percentual(
                extremos[p.dataIndex].margem_pct,
              )}`,
          },
          // Rede de seguranca: num recorte apertado varias barras ficam curtas e
          // proximas do zero, e os rotulos se empilhariam ilegiveis. Aqui o
          // ECharts esconde o que sobrepoe em vez de embaralhar tudo.
          labelLayout: { hideOverlap: true },
          data: extremos.map((item) => {
            const valor = numeroBruto(item.margem);
            const perda = valor < 0;
            return {
              value: valor,
              itemStyle: {
                color: perda ? negativa : positiva,
                borderRadius: perda ? [4, 0, 0, 4] : [0, 4, 4, 0],
              },
              // A barra negativa cresce para a esquerda; o rotulo vai para o lado
              // do zero (`right` = borda da barra junto ao zero, crescendo para a
              // direita, area vazia da linha) em vez da ponta esquerda, onde
              // batia no codigo do SKU do eixo.
              label: perda ? { position: "right" as const } : undefined,
            };
          }),
        },
      ],
    };
}
