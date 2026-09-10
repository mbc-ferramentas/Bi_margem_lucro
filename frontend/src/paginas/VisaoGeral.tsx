/** Visão geral — a leitura de diretoria.
 *
 *  A tela responde, nesta ordem, às quatro perguntas de quem abre o BI e tem
 *  cinco minutos: **quanto sobrou** (o destaque), **como se formou** (a
 *  cascata), **para onde está indo** (a evolução), **de onde vem e onde escapa**
 *  (armazém e SKU) e **o que ainda vai faturar** (a carteira).
 *
 *  Hierarquia é a decisão de projeto principal: antes eram sete cartões do mesmo
 *  tamanho, e um painel em que todo número tem o mesmo peso não tem resposta —
 *  tem inventário. Aqui a margem bruta é o número da tela, e todo o resto é
 *  contexto dela.
 *
 *  A comparação com o período anterior é calculada no cliente (`periodo.ts` +
 *  uma segunda chamada a `/kpis`): a API não tem endpoint de comparativo, mas
 *  responde qualquer janela.
 *
 *  Fase 1: margem **bruta**. O canal Marketplace não tem a comissão lançada, e é
 *  por isso que o aviso fica no topo e se repete na nota do gráfico por canal.
 */

import { Filtros } from "@compartilhado/api/filtros";
import { Granularidade } from "@compartilhado/config";
import { useArmazens } from "@entidades/armazem";
import { useCarteira } from "@entidades/carteira";
import { useOpcoes } from "@entidades/filtros";
import { PontoSerie, useKpis, useSerie } from "@entidades/margem";
import { ItemSku, useSkus } from "@entidades/sku";
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";

import { Button } from "@compartilhado/ui/atomos/button";
import { BarraFiltros } from "@widgets/barra-filtros";
import { Grafico, Sparkline, baseDoTema, corDaSerie, token, type EChartsOption, useOpcaoGrafico } from "@compartilhado/grafico";
import { SkeletonGrafico, SkeletonTiles } from "@compartilhado/ui/moleculas/Skeleton";
import { Tabela, type Coluna } from "@compartilhado/ui/organismos/Tabela";
import { AvisoMarketplace, Badge, BarraComposicao, CartaoDestaque, CartaoKpi, Cascata, Delta, Erro, GradeKpis, Nota, Secao, Segmentado, Vazio } from "@compartilhado/ui";
import { CabecalhoPagina } from "@widgets/cabecalho-pagina";
import { escreverFiltros, useFiltrosUrl } from "@entidades/filtros";
import {
  dataCurta,
  inteiro,
  moeda,
  moedaCurta,
  numeroBruto,
  percentual,
  rotulosDoPeriodo,
} from "@compartilhado/lib/formato";
import {
  type Janela,
  fatiaDoPeriodo,
  granularidadeAuto,
  janelaEfetiva,
  periodoAnterior,
  rotuloJanela,
} from "@entidades/filtros";

/** `numeroBruto` devolve 0 para nulo, o que serve para somar e atrapalha para
 *  comparar: variação contra uma base ausente não é queda de 100%, é ausência
 *  de comparação. */
function valorOuNulo(valor: string | number | null | undefined): number | null {
  return valor === null || valor === undefined ? null : numeroBruto(valor);
}

type Metrica = "margem" | "margem_pct" | "receita";

const METRICAS: Record<Metrica, { rotulo: string; formatar: (v: number) => string }> = {
  margem: { rotulo: "Margem R$", formatar: moeda },
  margem_pct: { rotulo: "Margem %", formatar: (v) => percentual(v) },
  receita: { rotulo: "Receita", formatar: moeda },
};

/** Quantos armazéns e quantos SKUs cabem em um cartão de resumo antes de virarem
 *  uma tabela mal disfarçada. Quem precisa da lista inteira tem o link ao lado. */
const TOPO_ARMAZEM = 6;
const TOPO_SKU = 5;

/** Cabecalho da primeira coluna da tabela da serie: o que cada linha representa
 *  muda com a agregacao. */
const ROTULO_PERIODO: Record<Granularidade, string> = {
  dia: "Dia",
  semana: "Semana",
  mes: "Competência",
};

export function VisaoGeral() {
  // Filtros na URL como nas demais telas: com useState local, o link da visao
  // geral filtrada nao carregava o recorte para quem o recebia.
  const [filtros, setFiltros] = useFiltrosUrl();
  const [modo, setModo] = useState<"grafico" | "tabela">("grafico");
  const [metrica, setMetrica] = useState<Metrica>("margem");
  const [offsetTabela, setOffsetTabela] = useState(0);
  const [itensPorPagina, setItensPorPagina] = useState(25);
  const navegar = useNavigate();
  const consulta = escreverFiltros(filtros);

  const opcoes = useOpcoes();
  const periodoBase = opcoes.data?.opcoes.periodo;

  const janela = useMemo(() => janelaEfetiva(filtros, periodoBase), [filtros, periodoBase]);
  const anterior = useMemo(() => periodoAnterior(filtros, periodoBase), [filtros, periodoBase]);

  const granularidade = granularidadeAuto(janela);

  const [pilhaZoom, setPilhaZoom] = useState<(Janela | null)[]>([]);

  const kpis = useKpis(filtros);
  const kpisAnterior = useKpis(anterior ?? {}, Boolean(anterior));
  const serie = useSerie(filtros, granularidade);
  const armazens = useArmazens(filtros, "-margem");
  const melhores = useSkus(filtros, "-margem", 0, TOPO_SKU);
  const piores = useSkus(filtros, "margem", 0, TOPO_SKU);
  // A carteira ignora o periodo de proposito: la a data filtrada e a **entrega
  // prometida**, nao a emissao da nota. Herdar um mes ja faturado mostraria uma
  // carteira vazia sem explicar por que. As demais dimensoes seguem valendo.
  const filtrosCarteira = useMemo(
    () => ({ ...filtros, data_inicio: undefined, data_fim: undefined }),
    [filtros],
  );
  // Uma linha so: a tela usa apenas o `resumo`, que a API calcula sobre o
  // conjunto filtrado inteiro e nao sobre a pagina.
  const carteira = useCarteira(filtrosCarteira, "-valor", 0, 1);

  const k = kpis.data?.kpis;
  const kAnterior = anterior ? kpisAnterior.data?.kpis : undefined;
  const escopo = kpis.data?.escopo;
  const referencia = anterior ? rotuloJanela(anterior) : null;

  const canais = useMemo(
    () => [...new Set(serie.data?.serie.map((p) => p.canal) ?? [])].sort(),
    [serie.data],
  );
  const periodos = useMemo(
    () => [...new Set(serie.data?.serie.map((p) => p.periodo) ?? [])].sort(),
    [serie.data],
  );

  /** "S1", "S2"... na agregacao semanal; a data nas demais. */
  const rotulos = useMemo(
    () => rotulosDoPeriodo(periodos, granularidade),
    [periodos, granularidade],
  );

  /** Margem total por periodo, somando os canais — a linha da sparkline. */
  const tendencia = useMemo(
    () =>
      periodos.map((p) =>
        (serie.data?.serie ?? [])
          .filter((x) => x.periodo === p)
          .reduce((soma, x) => soma + numeroBruto(x.margem), 0),
      ),
    [periodos, serie.data],
  );

  // useOpcaoGrafico injeta o tema resolvido nas dependencias: baseDoTema() e
  // corDaSerie() leem as variaveis CSS via getComputedStyle no momento do
  // calculo, entao sem isso o grafico mantem as cores do tema anterior.
  const opcao = useOpcaoGrafico<EChartsOption>(() => {
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
          const ponto = serie.data?.serie.find((x) => x.periodo === p && x.canal === canal);
          return ponto ? valorOuNulo(ponto[metrica]) : null;
        }),
      })),
    };
  }, [canais, periodos, rotulos, serie.data, metrica, granularidade, janela]);

  /** Margem por armazem, somando os grupos: a API devolve um par armazem x
   *  grupo por linha, e aqui so o total do armazem interessa. */
  const porArmazem = useMemo(() => {
    const totais = new Map<string, { rotulo: string; margem: number; receita: number }>();
    for (const linha of armazens.data?.armazens ?? []) {
      const codigo = linha.armazem ?? "—";
      const atual = totais.get(codigo) ?? {
        rotulo: linha.armazem_rotulo ?? codigo,
        margem: 0,
        receita: 0,
      };
      atual.margem += numeroBruto(linha.margem);
      atual.receita += numeroBruto(linha.receita);
      totais.set(codigo, atual);
    }
    const ordenados = [...totais.values()].sort((a, b) => b.margem - a.margem);
    if (ordenados.length <= TOPO_ARMAZEM) return ordenados;
    // Cauda somada em "Outros" em vez de truncada: o grafico continua fechando
    // com a margem total do topo da tela.
    const cauda = ordenados.slice(TOPO_ARMAZEM);
    return [
      ...ordenados.slice(0, TOPO_ARMAZEM),
      {
        rotulo: `Outros (${cauda.length})`,
        margem: cauda.reduce((s, a) => s + a.margem, 0),
        receita: cauda.reduce((s, a) => s + a.receita, 0),
      },
    ];
  }, [armazens.data]);

  const opcaoArmazem = useOpcaoGrafico<EChartsOption>(() => {
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
  }, [porArmazem]);

  /** Os cinco que mais somam e os cinco que mais tiram, numa escala só.
   *
   *  Deduplicado por SKU: num recorte pequeno o mesmo item pode encabecar as
   *  duas pontas, e ele apareceria duas vezes na mesma barra. */
  const extremos = useMemo(() => {
    const porSku = new Map<string, ItemSku>();
    for (const item of [...(melhores.data?.itens ?? []), ...(piores.data?.itens ?? [])]) {
      if (!porSku.has(item.sku)) porSku.set(item.sku, item);
    }
    // Ordem crescente: a barra `category` cresce de baixo para cima, entao o
    // pior fica embaixo e o melhor no topo.
    return [...porSku.values()].sort(
      (a, b) => numeroBruto(a.margem) - numeroBruto(b.margem),
    );
  }, [melhores.data, piores.data]);

  const opcaoSkus = useOpcaoGrafico<EChartsOption>(() => {
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
  }, [extremos]);

  function mudarFiltros(f: Filtros) {
    setOffsetTabela(0);
    setFiltros(f);
  }

  const irParaSku = useCallback(
    ({ nome }: { nome: string }) =>
      navegar(`/skus/${encodeURIComponent(nome)}${consulta ? `?${consulta}` : ""}`),
    [navegar, consulta],
  );
  const irParaArmazens = useCallback(
    () => navegar(`/armazens${consulta ? `?${consulta}` : ""}`),
    [navegar, consulta],
  );

  // Detalhar e estreitar o recorte da pagina inteira, e nao so o grafico: os
  // KPIs, a cascata e os rankings passam a falar da mesma semana que o usuario
  // clicou. A agregacao desce sozinha porque a janela encolheu.
  const detalharPeriodo = useCallback(
    ({ indice }: { indice: number }) => {
      const inicio = periodos[indice];
      if (!inicio) return;
      const fatia = fatiaDoPeriodo(inicio, granularidade, janela);
      setPilhaZoom((pilha) => [...pilha, janela]);
      setOffsetTabela(0);
      setFiltros({ ...filtros, data_inicio: fatia.inicio, data_fim: fatia.fim });
    },
    [periodos, granularidade, janela, filtros, setFiltros],
  );

  const voltarPeriodo = useCallback(() => {
    const anterior = pilhaZoom[pilhaZoom.length - 1];
    setPilhaZoom((pilha) => pilha.slice(0, -1));
    setOffsetTabela(0);
    setFiltros({
      ...filtros,
      data_inicio: anterior?.inicio,
      data_fim: anterior?.fim,
    });
  }, [pilhaZoom, filtros, setFiltros]);

  const colunas: readonly Coluna<PontoSerie>[] = useMemo(
    () => [
      {
        chave: null,
        rotulo: ROTULO_PERIODO[granularidade],
        fixa: true,
        celula: (p) => rotulos[periodos.indexOf(p.periodo)] ?? p.periodo,
      },
      {
        chave: null,
        rotulo: "Canal",
        celula: (p) => (
          <>
            {/* O quadradinho liga a linha da tabela a serie do grafico: sem ele
                a alternativa em tabela perde a identidade da cor. */}
            <span
              className="mr-1.5 inline-block size-2.5 rounded-[2px] align-baseline"
              style={{ background: corDaSerie(canais.indexOf(p.canal)) }}
              aria-hidden="true"
            />
            {p.canal}
          </>
        ),
      },
      { chave: null, rotulo: "Receita", num: true, celula: (p) => moeda(p.receita) },
      { chave: null, rotulo: "Custo", num: true, celula: (p) => moeda(p.custo) },
      {
        chave: null,
        rotulo: "Margem",
        num: true,
        negativo: (p) => numeroBruto(p.margem) < 0,
        celula: (p) => moeda(p.margem),
      },
      { chave: null, rotulo: "Margem %", num: true, celula: (p) => percentual(p.margem_pct) },
    ],
    [canais, granularidade, periodos, rotulos],
  );

  const resumoCarteira = carteira.data?.resumo;
  const rotuloDoRecorte = rotuloJanela(filtros);

  return (
    <>
      <CabecalhoPagina
        titulo="Visão geral"
        descricao="Margem bruta = receita − (quantidade × custo unitário). O custo vem congelado na nota (D2_CUSTO1)."
        contexto={
          <>
            <Badge tom="info">{rotuloDoRecorte ?? "Todo o período carregado"}</Badge>
            {escopo && <Badge>{escopo.rotulo}</Badge>}
          </>
        }
      />

      {escopo && <AvisoMarketplace texto={escopo.aviso_marketplace} />}

      <BarraFiltros valor={filtros} aoMudar={mudarFiltros} />

      {kpis.isError && <Erro mensagem={(kpis.error as Error).message} />}
      {kpis.isPending && <SkeletonTiles quantidade={4} />}

      {k && (
        // Refetch nao volta ao esqueleto: o numero anterior fica na tela em meio
        // tom ate o novo chegar. Piscar o esqueleto a cada filtro faz a pagina
        // saltar e custa a leitura que ja estava em andamento.
        <div
          className={
            kpis.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"
          }
        >
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,2fr)]">
            <CartaoDestaque
              rotulo="Margem bruta"
              valor={moeda(k.margem_bruta)}
              secundario={percentual(k.margem_pct)}
              tom={numeroBruto(k.margem_bruta) < 0 ? "critico" : "bom"}
              apoio={`Sobre ${moeda(k.receita_bruta)} de receita bruta · ${inteiro(
                k.pedidos,
              )} pedidos · ${inteiro(k.skus)} SKUs`}
              delta={
                <Delta
                  atual={valorOuNulo(k.margem_pct)}
                  anterior={valorOuNulo(kAnterior?.margem_pct)}
                  formato="pontos"
                  referencia={referencia}
                />
              }
              rodape={
                <Sparkline
                  valores={tendencia}
                  rotuloAcessivel="Tendência da margem bruta mês a mês no período filtrado."
                />
              }
            />

            <GradeKpis colunas={2} margem={false}>
              <CartaoKpi
                rotulo="Receita bruta"
                valor={moeda(k.receita_bruta)}
                apoio={`${inteiro(k.linhas)} linhas no cálculo`}
                aoClicar={irParaArmazens}
                delta={
                  <Delta
                    atual={valorOuNulo(k.receita_bruta)}
                    anterior={valorOuNulo(kAnterior?.receita_bruta)}
                    referencia={referencia}
                  />
                }
              />
              <CartaoKpi
                rotulo="Custo total"
                valor={moeda(k.custo_total)}
                apoio={`${inteiro(k.quantidade)} unidades`}
                aoClicar={() => navegar(`/skus${consulta ? `?${consulta}` : ""}`)}
                delta={
                  // `inverter`: custo que sobe nao e boa noticia, e pintar de
                  // verde uma alta de custo seria pior do que nao pintar nada.
                  <Delta
                    atual={valorOuNulo(k.custo_total)}
                    anterior={valorOuNulo(kAnterior?.custo_total)}
                    inverter
                    referencia={referencia}
                  />
                }
              />
              <CartaoKpi
                rotulo="Ticket médio"
                valor={moeda(k.ticket_medio)}
                apoio="Receita bruta ÷ pedidos"
                aoClicar={() => navegar(`/vendedores${consulta ? `?${consulta}` : ""}`)}
                delta={
                  <Delta
                    atual={valorOuNulo(k.ticket_medio)}
                    anterior={valorOuNulo(kAnterior?.ticket_medio)}
                    referencia={referencia}
                  />
                }
              />
              <CartaoKpi
                rotulo="Pedidos"
                valor={inteiro(k.pedidos)}
                apoio={`${inteiro(k.skus)} SKUs distintos`}
                aoClicar={() => navegar(`/canais${consulta ? `?${consulta}` : ""}`)}
                delta={
                  <Delta
                    atual={k.pedidos}
                    anterior={kAnterior ? kAnterior.pedidos : null}
                    referencia={referencia}
                  />
                }
              />
            </GradeKpis>
          </div>
        </div>
      )}

      {/* `Secao` e um Card sem margem propria: o espacamento entre os blocos
          empilhados e desta pilha, e nao de cada cartao. */}
      <div className="flex flex-col gap-4">
        {k && (
          <Secao
            titulo="Formação da margem"
            nota="O Protheus registra o desconto à parte — a receita bruta não o abate."
          >
            <Cascata
              parcelas={[
                { rotulo: "Receita bruta", valor: moeda(k.receita_bruta) },
                { rotulo: "Desconto", valor: moeda(k.desconto_total) },
                { rotulo: "Custo total", valor: moeda(k.custo_total) },
                {
                  rotulo: "Margem líquida",
                  valor: moeda(k.margem_liquida),
                  operador: "=",
                },
              ]}
            />
            <Nota>
              A margem bruta, antes do desconto, é {moeda(k.margem_bruta)} (
              {percentual(k.margem_pct)} da receita bruta). Depois do desconto de{" "}
              {moeda(k.desconto_total)}, a margem líquida é {moeda(k.margem_liquida)} (
              {percentual(k.margem_liquida_pct)} sobre {moeda(k.receita_liquida)} de
              receita líquida).
            </Nota>
          </Secao>
        )}

        {serie.isPending && <SkeletonGrafico altura={320} />}
        {serie.isError && <Erro mensagem={(serie.error as Error).message} />}

        {serie.data && (
          <Secao
            titulo="Evolução no tempo"
            nota={`Cada canal é uma série independente, na mesma escala e num eixo só. A margem do Marketplace não desconta comissão.${
              granularidade === "dia"
                ? ""
                : " A agregação segue o período filtrado — clique num ponto para abrir o detalhe."
            }`}
            acao={
              <div className="flex flex-wrap items-center justify-end gap-2">
                {pilhaZoom.length > 0 && (
                  <Button variant="link" size="sm" onClick={voltarPeriodo}>
                    Voltar ao período anterior
                  </Button>
                )}
                <Segmentado
                  valor={metrica}
                  aoMudar={setMetrica}
                  rotulo="Métrica do gráfico"
                  opcoes={
                    Object.entries(METRICAS).map(([chave, { rotulo }]) => [
                      chave as Metrica,
                      rotulo,
                    ]) as readonly (readonly [Metrica, string])[]
                  }
                />
                <Segmentado
                  valor={modo}
                  aoMudar={setModo}
                  rotulo="Forma de exibição"
                  opcoes={[
                    ["grafico", "Gráfico"],
                    ["tabela", "Tabela"],
                  ]}
                />
              </div>
            }
          >
            {serie.data.serie.length === 0 ? (
              <Vazio mensagem="Nenhum dado no período selecionado." />
            ) : modo === "tabela" ? (
              <Tabela
                linhas={serie.data.serie}
                colunas={colunas}
                chaveLinha={(p) => `${p.periodo}-${p.canal}`}
                rotuloAcessivel="Margem bruta por período e canal"
                paginacao={{
                  modo: "cliente",
                  total: serie.data.serie.length,
                  offset: offsetTabela,
                  itensPorPagina,
                  aoMudarOffset: setOffsetTabela,
                  aoMudarItensPorPagina: (quantidade) => {
                    setOffsetTabela(0);
                    setItensPorPagina(quantidade);
                  },
                }}
              />
            ) : (
              <Grafico
                opcao={opcao}
                altura={320}
                rotuloAcessivel={`${METRICAS[metrica].rotulo} por período, uma linha por canal de venda.`}
                // Sem clique no nivel diario: nao ha nada abaixo dele, e o
                // cursor de mao prometeria um drill-down que nao acontece.
                aoClicar={granularidade === "dia" ? undefined : detalharPeriodo}
              />
            )}
          </Secao>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Secao
            titulo="De onde vem a margem"
            nota="Total por armazém, com a margem sobre a receita do próprio armazém."
            acao={
              <Button variant="link" size="sm" nativeButton={false} render={<Link to={`/armazens${consulta ? `?${consulta}` : ""}`} />}>
                Abrir por armazém
              </Button>
            }
          >
            {armazens.isError && <Erro mensagem={(armazens.error as Error).message} />}
            {armazens.isPending && <SkeletonGrafico altura={260} />}
            {armazens.data &&
              (porArmazem.length === 0 ? (
                <Vazio mensagem="Nenhum armazém no recorte selecionado." />
              ) : (
                <Grafico
                  opcao={opcaoArmazem}
                  altura={320}
                  rotuloAcessivel="Margem bruta por armazém, do maior para o menor."
                  aoClicar={irParaArmazens}
                />
              ))}
          </Secao>

          <Secao
            titulo="Onde a margem se forma e onde escapa"
            nota={`Os ${TOPO_SKU} SKUs que mais somam e os ${TOPO_SKU} que mais tiram, na mesma escala.`}
            acao={
              <Button variant="link" size="sm" nativeButton={false} render={<Link to={`/skus${consulta ? `?${consulta}` : ""}`} />}>
                Abrir por SKU
              </Button>
            }
          >
            {(melhores.isError || piores.isError) && (
              <Erro
                mensagem={((melhores.error ?? piores.error) as Error)?.message ?? "Falha ao carregar os SKUs."}
              />
            )}
            {(melhores.isPending || piores.isPending) && <SkeletonGrafico altura={260} />}
            {melhores.data &&
              piores.data &&
              (extremos.length === 0 ? (
                <Vazio mensagem="Nenhum SKU no recorte selecionado." />
              ) : (
                <Grafico
                  opcao={opcaoSkus}
                  altura={320}
                  rotuloAcessivel="Margem bruta por SKU: os que mais somam e os que mais tiram."
                  aoClicar={irParaSku}
                />
              ))}
          </Secao>
        </div>

        <Secao
          titulo="Carteira em aberto"
          nota={`${
            resumoCarteira?.dt_foto ? `Posição de ${dataCurta(resumoCarteira.dt_foto)}. ` : ""
          }O que já foi vendido e ainda não saiu. Não segue o filtro de competência: na carteira a data é a de entrega prometida, não a competência da venda.`}
          acao={
            <Button variant="link" size="sm" nativeButton={false} render={<Link to="/carteira" />}>
              Abrir carteira
            </Button>
          }
        >
          {carteira.isError && <Erro mensagem={(carteira.error as Error).message} />}
          {carteira.isPending && <SkeletonTiles quantidade={3} />}
          {resumoCarteira &&
            (resumoCarteira.itens === 0 ? (
              <Vazio mensagem="Nenhum pedido em aberto neste recorte." />
            ) : (
              <>
                <GradeKpis colunas={3} margem={false}>
                  <CartaoKpi
                    rotulo="Valor em aberto"
                    valor={moeda(resumoCarteira.valor_aberto)}
                    apoio={`${inteiro(resumoCarteira.pedidos)} pedidos · ${inteiro(
                      resumoCarteira.itens,
                    )} itens`}
                  />
                  <CartaoKpi
                    rotulo="Margem prevista"
                    valor={moeda(resumoCarteira.margem_prevista)}
                    apoio={`${percentual(
                      resumoCarteira.margem_prevista_pct,
                    )} — custo do cadastro, não congelado na nota`}
                  />
                  <CartaoKpi
                    rotulo="Entrega vencida"
                    valor={moeda(resumoCarteira.valor_atrasado)}
                    apoio={`${inteiro(resumoCarteira.itens_atrasados)} itens com prazo estourado`}
                    tom={resumoCarteira.itens_atrasados ? "critico" : "bom"}
                  />
                </GradeKpis>
                <BarraComposicao
                  valor={resumoCarteira.itens_atrasados / (resumoCarteira.itens || 1)}
                  rotulo="Itens com entrega vencida"
                  detalhe={`${inteiro(resumoCarteira.itens_atrasados)} de ${inteiro(
                    resumoCarteira.itens,
                  )}`}
                  tom={resumoCarteira.itens_atrasados ? "critico" : "bom"}
                />
              </>
            ))}
        </Secao>
      </div>
    </>
  );
}
