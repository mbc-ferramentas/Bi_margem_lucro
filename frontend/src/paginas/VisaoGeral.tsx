import type { EChartsOption } from "echarts";
import { useMemo, useState } from "react";

import { useKpis, useSerie } from "../api/hooks";
import type { Filtros } from "../api/tipos";
import { BarraFiltros } from "../componentes/Filtros";
import { Grafico, baseDoTema, corDaSerie } from "../componentes/Grafico";
import { AvisoMarketplace, Erro, Vazio } from "../componentes/Layout";
import { Paginacao } from "../componentes/Paginacao";
import { SeletorTema } from "../componentes/SeletorTema";
import { SkeletonGrafico, SkeletonTiles } from "../componentes/Skeleton";
import { competencia, inteiro, moeda, moedaCurta, numeroBruto, percentual } from "../formato";
import { useTema } from "../tema";

function Tile({
  rotulo,
  valor,
  apoio,
}: {
  rotulo: string;
  valor: string;
  apoio?: string;
}) {
  return (
    <div className="cartao tile">
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
      {apoio && <div className="apoio">{apoio}</div>}
    </div>
  );
}

export function VisaoGeral() {
  const [filtros, setFiltros] = useState<Filtros>({});
  const [verTabela, setVerTabela] = useState(false);
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

  // `resolvido` nao aparece no corpo do memo abaixo, mas precisa estar nas
  // dependencias: baseDoTema() e corDaSerie() leem as variaveis CSS via
  // getComputedStyle no momento do calculo. Sem isso o grafico mantem as cores
  // do tema anterior ate um reload.
  const { resolvido } = useTema();

  const opcao = useMemo<EChartsOption>(() => {
    const base = baseDoTema();
    return {
      ...base,
      color: canais.map((_, i) => corDaSerie(i)),
      legend: { ...base.legend, data: canais },
      tooltip: {
        ...base.tooltip,
        valueFormatter: (v) => moeda(v as number),
      },
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
        // Rotulo direto na ponta: exigido pela regra de relevo, porque dois tons
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
            serie.data?.serie.find((x) => x.periodo === p && x.canal === canal)
              ?.margem ?? null,
        ),
      })),
    };
  }, [canais, periodos, serie.data, resolvido]);

  const k = kpis.data?.kpis;
  const escopo = kpis.data?.escopo;

  function mudarFiltros(f: Filtros) {
    setOffsetTabela(0);
    setFiltros(f);
  }

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Visão geral</h1>
          <p className="subtitulo">
            Margem bruta = receita − (quantidade × custo unitário). O custo vem
            congelado na nota (D2_CUSTO1).
          </p>
        </div>
        <SeletorTema />
      </div>

      {escopo && <AvisoMarketplace texto={escopo.aviso_marketplace} />}

      <BarraFiltros valor={filtros} aoMudar={mudarFiltros} />

      {kpis.isError && <Erro mensagem={(kpis.error as Error).message} />}
      {kpis.isPending && <SkeletonTiles quantidade={4} />}

      {k && (
        <>
          <div className="grade grade-tiles">
            <Tile
              rotulo="Receita bruta"
              valor={moeda(k.receita_bruta)}
              apoio={`${inteiro(k.pedidos)} pedidos · ${inteiro(k.skus)} SKUs`}
            />
            <Tile
              rotulo="Custo total"
              valor={moeda(k.custo_total)}
              apoio={`${inteiro(k.quantidade)} unidades`}
            />
            <Tile
              rotulo="Margem bruta"
              valor={moeda(k.margem_bruta)}
              apoio={`${percentual(k.margem_pct)} sobre a receita bruta`}
            />
            <Tile
              rotulo="Ticket médio"
              valor={moeda(k.ticket_medio)}
              apoio={`${inteiro(k.linhas)} linhas no cálculo`}
            />
          </div>

          {/* O desconto vem registrado a parte no Protheus — a receita bruta nao o
              abate. Fica em uma faixa propria para que a diferenca entre o
              faturamento cheio e o efetivamente cobrado seja explicita. */}
          <div style={{ height: 14 }} />
          <div className="grade grade-tiles">
            <Tile
              rotulo="Desconto concedido"
              valor={moeda(k.desconto_total)}
              apoio={`${percentual(
                numeroBruto(k.receita_bruta)
                  ? numeroBruto(k.desconto_total) / numeroBruto(k.receita_bruta)
                  : null,
              )} da receita bruta`}
            />
            <Tile
              rotulo="Receita líquida"
              valor={moeda(k.receita_liquida)}
              apoio="Receita bruta − desconto"
            />
            <Tile
              rotulo="Margem líquida"
              valor={moeda(k.margem_liquida)}
              apoio={`${percentual(k.margem_liquida_pct)} sobre a receita líquida`}
            />
          </div>
        </>
      )}

      <div style={{ height: 14 }} />

      {serie.isPending && <SkeletonGrafico altura={300} />}
      {serie.isError && <Erro mensagem={(serie.error as Error).message} />}

      {serie.data && (
        <div className="cartao">
          <div className="cabecalho">
            <div>
              <h2>Margem bruta por competência</h2>
              <p className="nota">
                Cada canal é uma série independente. Escalas iguais, eixo único.
              </p>
            </div>
            <button className="botao-alt" onClick={() => setVerTabela((v) => !v)}>
              {verTabela ? "Ver gráfico" : "Ver tabela"}
            </button>
          </div>

          {serie.data.serie.length === 0 ? (
            <Vazio mensagem="Nenhum dado no período selecionado." />
          ) : verTabela ? (
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Competência</th>
                    <th>Canal</th>
                    <th className="num">Receita</th>
                    <th className="num">Custo</th>
                    <th className="num">Margem</th>
                    <th className="num">Margem %</th>
                  </tr>
                </thead>
                <tbody>
                  {serie.data.serie.slice(offsetTabela, offsetTabela + itensPorPagina).map((p, i) => (
                    <tr key={`${p.periodo}-${p.canal}-${i}`}>
                      <td>{competencia(p.periodo)}</td>
                      <td>
                        <span
                          className="marca-serie"
                          style={{ background: corDaSerie(canais.indexOf(p.canal)) }}
                          aria-hidden="true"
                        />
                        {p.canal}
                      </td>
                      <td className="num">{moeda(p.receita)}</td>
                      <td className="num">{moeda(p.custo)}</td>
                      <td className={numeroBruto(p.margem) < 0 ? "num negativo" : "num"}>
                        {moeda(p.margem)}
                      </td>
                      <td className="num">{percentual(p.margem_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Paginacao total={serie.data.serie.length} offset={offsetTabela} itensPorPagina={itensPorPagina} aoMudarOffset={setOffsetTabela} aoMudarItensPorPagina={(quantidade) => { setOffsetTabela(0); setItensPorPagina(quantidade); }} />
            </div>
          ) : (
            <Grafico
              opcao={opcao}
              altura={320}
              rotuloAcessivel="Margem bruta por competência, uma linha por canal de venda."
            />
          )}
        </div>
      )}
    </>
  );
}
