import type { EChartsOption } from "echarts";
import { useMemo, useState } from "react";

import { useVendedores } from "../api/hooks";
import type { Filtros } from "../api/tipos";
import { BarraFiltros } from "../componentes/Filtros";
import { Grafico, baseDoTema, corDaSerie } from "../componentes/Grafico";
import { Erro, Vazio } from "../componentes/Layout";
import { Paginacao } from "../componentes/Paginacao";
import { SeletorTema } from "../componentes/SeletorTema";
import { SkeletonTabela } from "../componentes/Skeleton";
import { inteiro, moeda, moedaCurta, numeroBruto, percentual } from "../formato";
import { useTema } from "../tema";

const COLUNAS = [
  { chave: "nome", rotulo: "Vendedor", num: false },
  { chave: "receita", rotulo: "Receita", num: true },
  { chave: "margem", rotulo: "Margem", num: true },
  { chave: "margem_pct", rotulo: "Margem %", num: true },
  { chave: "pedidos", rotulo: "Pedidos", num: true },
] as const;

export function Vendedores() {
  const [filtros, setFiltros] = useState<Filtros>({});
  const [ordenar, setOrdenar] = useState("-margem");
  const [offset, setOffset] = useState(0);
  const [itensPorPagina, setItensPorPagina] = useState(25);

  const { data, isPending, isError, error } = useVendedores(filtros, ordenar);
  const linhas = data?.vendedores ?? [];

  // Ver a nota em VisaoGeral: `resolvido` entra nas deps porque baseDoTema() e
  // corDaSerie() leem as variaveis CSS no momento do calculo.
  const { resolvido } = useTema();

  const opcao = useMemo<EChartsOption>(() => {
    const base = baseDoTema();
    const top = [...linhas]
      .sort((a, b) => numeroBruto(b.margem) - numeroBruto(a.margem))
      .slice(0, 10)
      .reverse();

    return {
      ...base,
      legend: { show: false },
      grid: { ...base.grid, left: 8, right: 60 },
      tooltip: {
        ...base.tooltip,
        trigger: "item",
        valueFormatter: (v) => moeda(v as number),
      },
      xAxis: {
        ...base.xAxis,
        type: "value",
        axisLabel: { ...base.xAxis.axisLabel, formatter: (v: number) => moedaCurta(v) },
        splitLine: { lineStyle: { color: "var(--grid)" } },
      },
      yAxis: {
        ...base.yAxis,
        type: "category",
        data: top.map((v) => v.vendedor_nome ?? v.vendedor_codigo ?? "—"),
        splitLine: { show: false },
      },
      series: [
        {
          type: "bar" as const,
          barMaxWidth: 14,
          // Serie unica: sem legenda (o titulo ja a nomeia), com rotulo de valor.
          itemStyle: { color: corDaSerie(0), borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: "right" as const,
            formatter: (p: { dataIndex: number }) =>
              percentual(top[p.dataIndex].margem_pct),
            color: "var(--text-secondary)",
            fontSize: 11,
          },
          data: top.map((v) => numeroBruto(v.margem)),
        },
      ],
    };
  }, [linhas, resolvido]);

  function ordenarPor(chave: string) {
    setOffset(0);
    setOrdenar((atual) => (atual === `-${chave}` ? chave : `-${chave}`));
  }

  function mudarFiltros(f: Filtros) {
    setOffset(0);
    setFiltros(f);
  }

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Por vendedor</h1>
          <p className="subtitulo">
            Margem bruta. Ranking restrito à venda interna — o canal Marketplace é
            operado pelo integrador Lexos e não tem vendedor pessoa física.
          </p>
        </div>
        <SeletorTema />
      </div>

      <BarraFiltros valor={filtros} aoMudar={mudarFiltros} ocultarCanal />

      {isError && <Erro mensagem={(error as Error).message} />}
      {isPending && <SkeletonTabela linhas={8} colunas={5} />}

      {data && linhas.length === 0 && (
        <Vazio mensagem="Nenhum vendedor com venda no período selecionado." />
      )}

      {linhas.length > 0 && (
        <>
          <div className="cartao">
            <h2>Margem por vendedor</h2>
            <p className="nota">
              Dez maiores por margem absoluta. O rótulo à direita é a margem
              percentual.
            </p>
            <Grafico
              opcao={opcao}
              altura={Math.max(220, Math.min(linhas.length, 10) * 34)}
              rotuloAcessivel="Margem bruta por vendedor, dez maiores."
            />
          </div>

          <div className="cartao" style={{ marginTop: 14 }}>
            <h2>Detalhamento</h2>
            <p className="nota">Clique no cabeçalho para ordenar.</p>
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    {COLUNAS.map((c) => (
                      <th
                        key={c.chave}
                        className={c.num ? "num" : undefined}
                        onClick={() => ordenarPor(c.chave)}
                        aria-sort={
                          ordenar.replace("-", "") === c.chave
                            ? ordenar.startsWith("-")
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                      >
                        {c.rotulo}
                        {ordenar.replace("-", "") === c.chave &&
                          (ordenar.startsWith("-") ? " ↓" : " ↑")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.slice(offset, offset + itensPorPagina).map((v) => (
                    <tr key={v.vendedor_codigo ?? v.vendedor_nome}>
                      <td>{v.vendedor_nome ?? v.vendedor_codigo}</td>
                      <td className="num">{moeda(v.receita)}</td>
                      <td className={numeroBruto(v.margem) < 0 ? "num negativo" : "num"}>
                        {moeda(v.margem)}
                      </td>
                      <td className="num">{percentual(v.margem_pct)}</td>
                      <td className="num">{inteiro(v.pedidos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacao total={linhas.length} offset={offset} itensPorPagina={itensPorPagina} aoMudarOffset={setOffset} aoMudarItensPorPagina={(quantidade) => { setOffset(0); setItensPorPagina(quantidade); }} />
          </div>
        </>
      )}
    </>
  );
}
