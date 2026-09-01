import type { EChartsOption } from "echarts";
import { useMemo, useState } from "react";

import { useKpis, useSerie } from "../api/hooks";
import type { Filtros, PontoSerie } from "../api/tipos";
import { BarraFiltros } from "../componentes/Filtros";
import { Grafico, baseDoTema, corDaSerie, useOpcaoGrafico } from "../componentes/Grafico";
import { AvisoMarketplace, Erro, Vazio } from "../componentes/Layout";
import { SkeletonGrafico, SkeletonTiles } from "../componentes/Skeleton";
import { Tabela, type Coluna } from "../componentes/Tabela";
import {
  CabecalhoPagina,
  CartaoKpi,
  GradeKpis,
  Secao,
  Segmentado,
} from "../componentes/Visual";
import { useFiltrosUrl } from "../filtrosUrl";
import { competencia, inteiro, moeda, moedaCurta, numeroBruto, percentual } from "../formato";

export function VisaoGeral() {
  // Filtros na URL como nas demais telas: com useState local, o link da visao
  // geral filtrada nao carregava o recorte para quem o recebia.
  const [filtros, setFiltros] = useFiltrosUrl();
  const [modo, setModo] = useState<"grafico" | "tabela">("grafico");
  const [offsetTabela, setOffsetTabela] = useState(0);
  const [itensPorPagina, setItensPorPagina] = useState(25);

  const kpis = useKpis(filtros);
  const serie = useSerie(filtros, "mes");

  const canais = useMemo(
    () => [...new Set(serie.data?.serie.map((p) => p.canal) ?? [])].sort(),
    [serie.data],
  );
  const periodos = useMemo(
    () => [...new Set(serie.data?.serie.map((p) => p.periodo) ?? [])].sort(),
    [serie.data],
  );

  // useOpcaoGrafico injeta o tema resolvido nas dependencias: baseDoTema() e
  // corDaSerie() leem as variaveis CSS via getComputedStyle no momento do
  // calculo, entao sem isso o grafico mantem as cores do tema anterior.
  const opcao = useOpcaoGrafico<EChartsOption>(() => {
    const base = baseDoTema();
    return {
      ...base,
      color: canais.map((_, i) => corDaSerie(i)),
      legend: { ...base.legend, data: canais },
      tooltip: { ...base.tooltip, valueFormatter: (v) => moeda(v as number) },
      xAxis: { ...base.xAxis, type: "category", data: periodos.map(competencia) },
      yAxis: {
        ...base.yAxis,
        type: "value",
        axisLabel: { ...base.yAxis.axisLabel, formatter: (v: number) => moedaCurta(v) },
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
        emphasis: { focus: "series" as const },
        data: periodos.map(
          (p) =>
            serie.data?.serie.find((x) => x.periodo === p && x.canal === canal)?.margem ?? null,
        ),
      })),
    };
  }, [canais, periodos, serie.data]);

  const k = kpis.data?.kpis;
  const escopo = kpis.data?.escopo;

  function mudarFiltros(f: Filtros) {
    setOffsetTabela(0);
    setFiltros(f);
  }

  const colunas: readonly Coluna<PontoSerie>[] = useMemo(
    () => [
      { chave: null, rotulo: "Competência", fixa: true, celula: (p) => competencia(p.periodo) },
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
    [canais],
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Visão geral"
        descricao="Margem bruta = receita − (quantidade × custo unitário). O custo vem congelado na nota (D2_CUSTO1)."
      />

      {escopo && <AvisoMarketplace texto={escopo.aviso_marketplace} />}

      <BarraFiltros valor={filtros} aoMudar={mudarFiltros} />

      {kpis.isError && <Erro mensagem={(kpis.error as Error).message} />}
      {kpis.isPending && <SkeletonTiles quantidade={4} />}

      {k && (
        <>
          <GradeKpis>
            <CartaoKpi
              rotulo="Receita bruta"
              valor={moeda(k.receita_bruta)}
              apoio={`${inteiro(k.pedidos)} pedidos · ${inteiro(k.skus)} SKUs`}
            />
            <CartaoKpi
              rotulo="Custo total"
              valor={moeda(k.custo_total)}
              apoio={`${inteiro(k.quantidade)} unidades`}
            />
            <CartaoKpi
              rotulo="Margem bruta"
              valor={moeda(k.margem_bruta)}
              apoio={`${percentual(k.margem_pct)} sobre a receita bruta`}
              tom={numeroBruto(k.margem_bruta) < 0 ? "critico" : "bom"}
            />
            <CartaoKpi
              rotulo="Ticket médio"
              valor={moeda(k.ticket_medio)}
              apoio={`${inteiro(k.linhas)} linhas no cálculo`}
            />
          </GradeKpis>

          {/* O desconto vem registrado a parte no Protheus — a receita bruta nao o
              abate. Fica em uma faixa propria para que a diferenca entre o
              faturamento cheio e o efetivamente cobrado seja explicita. */}
          <GradeKpis>
            <CartaoKpi
              rotulo="Desconto concedido"
              valor={moeda(k.desconto_total)}
              apoio={`${percentual(
                numeroBruto(k.receita_bruta)
                  ? numeroBruto(k.desconto_total) / numeroBruto(k.receita_bruta)
                  : null,
              )} da receita bruta`}
            />
            <CartaoKpi
              rotulo="Receita líquida"
              valor={moeda(k.receita_liquida)}
              apoio="Receita bruta − desconto"
            />
            <CartaoKpi
              rotulo="Margem líquida"
              valor={moeda(k.margem_liquida)}
              apoio={`${percentual(k.margem_liquida_pct)} sobre a receita líquida`}
              tom={numeroBruto(k.margem_liquida) < 0 ? "critico" : "bom"}
            />
          </GradeKpis>
        </>
      )}

      {serie.isPending && <SkeletonGrafico altura={300} />}
      {serie.isError && <Erro mensagem={(serie.error as Error).message} />}

      {serie.data && (
        <Secao
          titulo="Margem bruta por competência"
          nota="Cada canal é uma série independente. Escalas iguais, eixo único."
          acao={
            <Segmentado
              valor={modo}
              aoMudar={setModo}
              rotulo="Forma de exibição"
              opcoes={[
                ["grafico", "Gráfico"],
                ["tabela", "Tabela"],
              ]}
            />
          }
        >
          {serie.data.serie.length === 0 ? (
            <Vazio mensagem="Nenhum dado no período selecionado." />
          ) : modo === "tabela" ? (
            <Tabela
              linhas={serie.data.serie}
              colunas={colunas}
              chaveLinha={(p) => `${p.periodo}-${p.canal}`}
              rotuloAcessivel="Margem bruta por competência e canal"
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
              rotuloAcessivel="Margem bruta por competência, uma linha por canal de venda."
            />
          )}
        </Secao>
      )}
    </>
  );
}
