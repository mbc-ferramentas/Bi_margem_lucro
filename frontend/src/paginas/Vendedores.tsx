import type { EChartsOption } from "echarts";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useVendedores } from "../api/hooks";
import type { Filtros } from "../api/tipos";
import { BarraFiltros } from "../componentes/Filtros";
import { Grafico, baseDoTema, corDaSerie } from "../componentes/Grafico";
import { IconeOlho } from "../componentes/Icones";
import { Erro, Vazio } from "../componentes/Layout";
import { Paginacao } from "../componentes/Paginacao";
import { SkeletonTabela } from "../componentes/Skeleton";
import { Abas, CabecalhoPagina, CartaoKpi, PainelInsight } from "../componentes/Visual";
import { escreverFiltros, useAbaUrl, useFiltrosUrl } from "../filtrosUrl";
import { inteiro, moeda, moedaCurta, numeroBruto, percentual } from "../formato";
import { useTema } from "../tema";

// `chave: null` = coluna que nao ordena; a de acoes nao e um dado do ranking.
const COLUNAS: readonly { chave: string | null; rotulo: string; num: boolean }[] = [
  { chave: "nome", rotulo: "Vendedor", num: false },
  { chave: "receita", rotulo: "Receita", num: true },
  { chave: "margem", rotulo: "Margem", num: true },
  { chave: "margem_pct", rotulo: "Margem %", num: true },
  { chave: "pedidos", rotulo: "Pedidos", num: true },
  { chave: null, rotulo: "Ações", num: false },
];

export function Vendedores() {
  // Filtros na URL, e nao em memoria: sem isso, voltar do drill-down devolveria
  // a tela sem periodo nem grupo (ver o cabecalho de `filtrosUrl.ts`).
  const [filtros, setFiltros] = useFiltrosUrl();
  const [ordenar, setOrdenar] = useState("-margem");
  const [offset, setOffset] = useState(0);
  const [itensPorPagina, setItensPorPagina] = useState(25);
  const [aba, setAba] = useAbaUrl(["gerencial", "detalhamento"] as const, "gerencial");
  const [metrica, setMetrica] = useState<"margem" | "margem_pct" | "receita">("margem");

  const { data, isPending, isError, error } = useVendedores(filtros, ordenar);
  const linhas = data?.vendedores ?? [];
  const consulta = escreverFiltros(filtros);
  const totais = useMemo(() => {
    const receita = linhas.reduce((s, v) => s + numeroBruto(v.receita), 0);
    const margem = linhas.reduce((s, v) => s + numeroBruto(v.margem), 0);
    const negativos = linhas.filter((v) => numeroBruto(v.margem) < 0).length;
    const lider = [...linhas].sort((a, b) => numeroBruto(b.margem) - numeroBruto(a.margem))[0];
    return { receita, margem, margemPct: receita ? margem / receita : null, negativos, lider };
  }, [linhas]);

  // Ver a nota em VisaoGeral: `resolvido` entra nas deps porque baseDoTema() e
  // corDaSerie() leem as variaveis CSS no momento do calculo.
  const { resolvido } = useTema();

  const opcao = useMemo<EChartsOption>(() => {
    const base = baseDoTema();
    const top = [...linhas]
      .sort((a, b) => numeroBruto(b[metrica]) - numeroBruto(a[metrica]))
      .slice(0, 10)
      .reverse();

    return {
      ...base,
      legend: { show: false },
      grid: { ...base.grid, left: 8, right: 60 },
      tooltip: {
        ...base.tooltip,
        trigger: "item",
        valueFormatter: (v) => metrica === "margem_pct" ? percentual(v as number) : moeda(v as number),
      },
      xAxis: {
        ...base.xAxis,
        type: "value",
        axisLabel: { ...base.xAxis.axisLabel, formatter: (v: number) => metrica === "margem_pct" ? percentual(v) : moedaCurta(v) },
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
            formatter: (p: { dataIndex: number }) => metrica === "margem_pct" ? moeda(top[p.dataIndex].margem) : percentual(top[p.dataIndex].margem_pct),
            color: "var(--text-secondary)",
            fontSize: 11,
          },
          markLine: metrica === "margem_pct" ? { silent: true, symbol: "none", lineStyle: { color: "var(--axis)", type: "dashed" }, data: [{ xAxis: totais.margemPct ?? 0, name: "Média" }] } : undefined,
          data: top.map((v) => numeroBruto(v[metrica])),
        },
      ],
    };
  }, [linhas, metrica, resolvido, totais.margemPct]);

  function ordenarPor(chave: string | null) {
    if (!chave) return;
    setOffset(0);
    setOrdenar((atual) => (atual === `-${chave}` ? chave : `-${chave}`));
  }

  function mudarFiltros(f: Filtros) {
    setOffset(0);
    setFiltros(f);
  }

  return (
    <>
      <CabecalhoPagina titulo="Por vendedor" descricao="Compare desempenho, identifique concentração de margem e encontre vendedores que precisam de atenção." />

      <BarraFiltros valor={filtros} aoMudar={mudarFiltros} ocultarCanal />

      {isError && <Erro mensagem={(error as Error).message} />}
      {isPending && <SkeletonTabela linhas={8} colunas={6} />}

      {data && linhas.length === 0 && (
        <Vazio mensagem="Nenhum vendedor com venda no período selecionado." />
      )}

      {linhas.length > 0 && (
        <>
          <div className="grade-kpis">
            <CartaoKpi rotulo="Receita total" valor={moeda(totais.receita)} apoio={`${inteiro(linhas.length)} vendedores ativos`} />
            <CartaoKpi rotulo="Margem total" valor={moeda(totais.margem)} apoio="Margem bruta no recorte" tom={totais.margem < 0 ? "critico" : "bom"} />
            <CartaoKpi rotulo="Margem ponderada" valor={percentual(totais.margemPct)} apoio="Margem total sobre receita total" />
            <CartaoKpi rotulo="Margem negativa" valor={inteiro(totais.negativos)} apoio={totais.negativos ? "Vendedores para revisar" : "Nenhuma ocorrência"} tom={totais.negativos ? "critico" : "bom"} />
          </div>

          <Abas valor={aba} aoMudar={setAba} opcoes={[{ valor: "gerencial", rotulo: "Visão gerencial" }, { valor: "detalhamento", rotulo: "Detalhamento", contador: linhas.length }]} />

          {aba === "gerencial" && <>
            <div className="grade-insights">
              <PainelInsight titulo="Líder de margem" valor={totais.lider?.vendedor_nome ?? totais.lider?.vendedor_codigo ?? "—"} texto={totais.lider ? `${moeda(totais.lider.margem)} de margem bruta` : "Sem dados"} tom="bom" />
              <PainelInsight titulo="Concentração do líder" valor={percentual(totais.margem ? numeroBruto(totais.lider?.margem) / totais.margem : null)} texto="Participação na margem total" />
              <PainelInsight titulo="Pontos de atenção" valor={inteiro(totais.negativos)} texto="Vendedores com margem abaixo de zero" tom={totais.negativos ? "critico" : "bom"} />
            </div>
            <div className="cartao">
              <div className="secao-topo"><div><h2>Ranking de vendedores</h2><p className="nota">Dez maiores na métrica selecionada.</p></div><div className="segmented" aria-label="Métrica do ranking">{([['margem','Margem R$'],['margem_pct','Margem %'],['receita','Receita']] as const).map(([valor, rotulo]) => <button key={valor} aria-pressed={metrica === valor} onClick={() => setMetrica(valor)}>{rotulo}</button>)}</div></div>
              <Grafico opcao={opcao} altura={Math.max(240, Math.min(linhas.length, 10) * 36)} rotuloAcessivel="Ranking dos dez vendedores na métrica selecionada." />
            </div>
          </>}

          {aba === "detalhamento" && <div className="cartao">
            <h2>Detalhamento</h2>
            <p className="nota">Clique no cabeçalho para ordenar.</p>
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    {COLUNAS.map((c) => (
                      <th
                        key={c.rotulo}
                        className={c.num ? "num" : undefined}
                        onClick={() => ordenarPor(c.chave)}
                        style={{ cursor: c.chave ? "pointer" : "default" }}
                        aria-sort={
                          !c.chave || ordenar.replace("-", "") !== c.chave
                            ? "none"
                            : ordenar.startsWith("-")
                              ? "descending"
                              : "ascending"
                        }
                      >
                        {c.rotulo}
                        {c.chave &&
                          ordenar.replace("-", "") === c.chave &&
                          (ordenar.startsWith("-") ? " ↓" : " ↑")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.slice(offset, offset + itensPorPagina).map((v, indice) => (
                    <tr key={v.vendedor_codigo ?? v.vendedor_nome}>
                      <td className="tabela-identidade"><strong>{inteiro(offset + indice + 1)}.</strong> {v.vendedor_nome ?? v.vendedor_codigo}</td>
                      <td className="num">{moeda(v.receita)}</td>
                      <td className={numeroBruto(v.margem) < 0 ? "num negativo" : "num"}>
                        {moeda(v.margem)}
                      </td>
                      <td className="num">{percentual(v.margem_pct)}</td>
                      <td className="num">{inteiro(v.pedidos)}</td>
                      <td className="acoes">
                        {/* A view ja filtra vendedor nulo, mas o schema tipa como
                            nullable: sem a guarda o link viraria /undefined/. */}
                        {v.vendedor_codigo && (
                          <Link
                            className="botao-alt acao-visualizar"
                            to={`/vendedores/${encodeURIComponent(
                              v.vendedor_codigo,
                            )}/pedidos${consulta ? `?${consulta}` : ""}`}
                            aria-label={`Visualizar pedidos de ${
                              v.vendedor_nome ?? v.vendedor_codigo
                            }`}
                          >
                            <IconeOlho />
                            Ver pedidos
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacao total={linhas.length} offset={offset} itensPorPagina={itensPorPagina} aoMudarOffset={setOffset} aoMudarItensPorPagina={(quantidade) => { setOffset(0); setItensPorPagina(quantidade); }} />
          </div>
          }
        </>
      )}
    </>
  );
}
