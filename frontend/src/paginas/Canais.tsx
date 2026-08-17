/** Por canal.
 *
 *  Regra de interface da fase 1: **os canais nao aparecem lado a lado**. O
 *  Marketplace tem 12-19% de comissao que ainda nao esta lancada; comparado com a
 *  venda interna, que nao tem custo equivalente, o grafico induziria a conclusao
 *  errada de que o marketplace e menos rentavel "mas da lucro".
 *
 *  Por isso esta tela mostra **um canal por vez**, escolhido num seletor. A
 *  comparacao entra na fase 2, junto com a comissao.
 */

import type { EChartsOption } from "echarts";
import { useMemo, useState } from "react";

import { useKpis, useOpcoes, useSerie } from "../api/hooks";
import type { Filtros } from "../api/tipos";
import { Grafico, baseDoTema, corDaSerie } from "../componentes/Grafico";
import { AvisoMarketplace, Erro, Vazio } from "../componentes/Layout";
import { SeletorTema } from "../componentes/SeletorTema";
import { SkeletonGrafico, SkeletonTiles } from "../componentes/Skeleton";
import { dataCurta, inteiro, moeda, moedaCurta, percentual } from "../formato";
import { useTema } from "../tema";

export function Canais() {
  const { data: opcoes } = useOpcoes();
  const canais = opcoes?.opcoes.canais ?? [];
  const [canal, setCanal] = useState<string | null>(null);

  const canalAtivo = canal ?? canais[0] ?? null;
  const filtros: Filtros = canalAtivo ? { canal: canalAtivo } : {};

  const kpis = useKpis(filtros);
  const serie = useSerie(filtros, "dia");

  // Ver a nota em VisaoGeral: `resolvido` entra nas deps porque baseDoTema() e
  // corDaSerie() leem as variaveis CSS no momento do calculo.
  const { resolvido } = useTema();

  const opcao = useMemo<EChartsOption>(() => {
    const base = baseDoTema();
    const pontos = [...(serie.data?.serie ?? [])].sort((a, b) =>
      a.periodo.localeCompare(b.periodo),
    );
    return {
      ...base,
      legend: { show: false },
      tooltip: { ...base.tooltip, valueFormatter: (v) => moeda(v as number) },
      xAxis: {
        ...base.xAxis,
        type: "category",
        data: pontos.map((p) => dataCurta(p.periodo)),
      },
      yAxis: {
        ...base.yAxis,
        type: "value",
        axisLabel: { ...base.yAxis.axisLabel, formatter: (v: number) => moedaCurta(v) },
      },
      series: [
        {
          name: "Margem bruta",
          type: "bar" as const,
          barMaxWidth: 18,
          itemStyle: { color: corDaSerie(0), borderRadius: [4, 4, 0, 0] },
          data: pontos.map((p) => Number(p.margem ?? 0)),
        },
      ],
    };
  }, [serie.data, resolvido]);

  const k = kpis.data?.kpis;
  const ehMarketplace = canalAtivo === "Marketplace";

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Por canal</h1>
          <p className="subtitulo">
            Um canal por vez. A comparação entre canais entra na fase 2, quando a
            comissão de marketplace estiver lançada.
          </p>
        </div>
        <SeletorTema />
      </div>

      {ehMarketplace && kpis.data && (
        <AvisoMarketplace texto={kpis.data.escopo.aviso_marketplace} />
      )}

      <div className="filtros">
        <div className="campo">
          <label htmlFor="sel-canal">Canal</label>
          <select
            id="sel-canal"
            value={canalAtivo ?? ""}
            onChange={(e) => setCanal(e.target.value)}
          >
            {canais.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {kpis.isError && <Erro mensagem={(kpis.error as Error).message} />}
      {kpis.isPending && <SkeletonTiles quantidade={3} />}

      {k && (
        <div className="grade grade-tiles">
          <div className="cartao tile">
            <div className="rotulo">Receita bruta</div>
            <div className="valor">{moeda(k.receita_bruta)}</div>
            <div className="apoio">{inteiro(k.pedidos)} pedidos</div>
          </div>
          <div className="cartao tile">
            <div className="rotulo">Margem bruta</div>
            <div className="valor">{moeda(k.margem_bruta)}</div>
            <div className="apoio">
              {percentual(k.margem_pct)}
              {ehMarketplace && " — antes da comissão"}
            </div>
          </div>
          <div className="cartao tile">
            <div className="rotulo">Ticket médio</div>
            <div className="valor">{moeda(k.ticket_medio)}</div>
            <div className="apoio">{inteiro(k.skus)} SKUs distintos</div>
          </div>
        </div>
      )}

      <div style={{ height: 14 }} />

      {serie.isPending && <SkeletonGrafico altura={280} />}
      {serie.data &&
        (serie.data.serie.length === 0 ? (
          <Vazio mensagem="Nenhum faturamento neste canal no período." />
        ) : (
          <div className="cartao">
            <h2>Margem bruta diária — {canalAtivo}</h2>
            <p className="nota">Somente este canal. Nenhuma outra série no gráfico.</p>
            <Grafico
              opcao={opcao}
              altura={280}
              rotuloAcessivel={`Margem bruta diária do canal ${canalAtivo}.`}
            />
          </div>
        ))}
    </>
  );
}
