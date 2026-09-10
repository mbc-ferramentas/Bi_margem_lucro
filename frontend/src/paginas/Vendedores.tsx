import type { EChartsOption } from "echarts";
import { EyeIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

import { useVendedores } from "../api/hooks";
import type { Filtros } from "../api/tipos";
import { Button } from "@compartilhado/ui/atomos/button";
import { BarraFiltros } from "../componentes/Filtros";
import { Grafico, baseDoTema, corDaSerie, token, useOpcaoGrafico } from "../componentes/Grafico";
import { Erro, Vazio } from "../componentes/Layout";
import { SkeletonTabela } from "../componentes/Skeleton";
import { Tabela, type Coluna } from "../componentes/Tabela";
import {
  Abas,
  CabecalhoPagina,
  CartaoKpi,
  GradeInsights,
  GradeKpis,
  PainelInsight,
  Secao,
  Segmentado,
} from "../componentes/Visual";
import { escreverFiltros, useAbaUrl, useFiltrosUrl } from "../filtrosUrl";
import { inteiro, moeda, moedaCurta, numeroBruto, percentual } from "@compartilhado/lib/formato";

type Linha = ReturnType<typeof useVendedores>["data"] extends infer D
  ? D extends { vendedores: (infer L)[] }
    ? L
    : never
  : never;

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

  // `useOpcaoGrafico` injeta o tema resolvido nas dependencias: baseDoTema() e
  // corDaSerie() leem as variaveis CSS no momento do calculo, entao trocar de
  // tema sem recalcular deixaria o grafico com as cores do modo anterior.
  const opcao = useOpcaoGrafico<EChartsOption>(() => {
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
        valueFormatter: (v) =>
          metrica === "margem_pct" ? percentual(v as number) : moeda(v as number),
      },
      xAxis: {
        ...base.xAxis,
        type: "value",
        axisLabel: {
          ...base.xAxis.axisLabel,
          formatter: (v: number) => (metrica === "margem_pct" ? percentual(v) : moedaCurta(v)),
        },
        splitLine: { lineStyle: { color: token("--grid") } },
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
              metrica === "margem_pct"
                ? moeda(top[p.dataIndex].margem)
                : percentual(top[p.dataIndex].margem_pct),
            color: token("--muted-foreground"),
            fontSize: 11,
          },
          markLine:
            metrica === "margem_pct"
              ? {
                  silent: true,
                  symbol: "none",
                  lineStyle: { color: token("--axis"), type: "dashed" },
                  data: [{ xAxis: totais.margemPct ?? 0, name: "Média" }],
                }
              : undefined,
          data: top.map((v) => numeroBruto(v[metrica])),
        },
      ],
    };
  }, [linhas, metrica, totais.margemPct]);

  function mudarFiltros(f: Filtros) {
    setOffset(0);
    setFiltros(f);
  }

  const colunas: readonly Coluna<Linha>[] = useMemo(
    () => [
      {
        chave: "nome",
        rotulo: "Vendedor",
        fixa: true,
        ordenarPor: () => 0,
        celula: (v) => {
          const posicao = linhas.indexOf(v) + 1;
          return (
            <>
              <strong>{inteiro(posicao)}.</strong> {v.vendedor_nome ?? v.vendedor_codigo}
            </>
          );
        },
      },
      { chave: "receita", rotulo: "Receita", num: true, celula: (v) => moeda(v.receita) },
      {
        chave: "margem",
        rotulo: "Margem",
        num: true,
        negativo: (v) => numeroBruto(v.margem) < 0,
        celula: (v) => moeda(v.margem),
      },
      {
        chave: "margem_pct",
        rotulo: "Margem %",
        num: true,
        celula: (v) => percentual(v.margem_pct),
      },
      { chave: "pedidos", rotulo: "Pedidos", num: true, celula: (v) => inteiro(v.pedidos) },
      {
        chave: null,
        rotulo: "Ações",
        acao: true,
        celula: (v) =>
          // A view ja filtra vendedor nulo, mas o schema tipa como nullable:
          // sem a guarda o link viraria /undefined/.
          v.vendedor_codigo ? (
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={
                <Link
                  to={`/vendedores/${encodeURIComponent(v.vendedor_codigo)}/pedidos${consulta ? `?${consulta}` : ""}`}
                  aria-label={`Visualizar pedidos de ${v.vendedor_nome ?? v.vendedor_codigo}`}
                />
              }
            >
              <EyeIcon data-icon="inline-start" />
              Ver pedidos
            </Button>
          ) : null,
      },
    ],
    [consulta, linhas],
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Por vendedor"
        descricao="Compare desempenho, identifique concentração de margem e encontre vendedores que precisam de atenção."
      />

      <BarraFiltros valor={filtros} aoMudar={mudarFiltros} ocultarCanal />

      {isError && <Erro mensagem={(error as Error).message} />}
      {isPending && <SkeletonTabela linhas={8} colunas={6} />}

      {data && linhas.length === 0 && (
        <Vazio mensagem="Nenhum vendedor com venda no período selecionado." />
      )}

      {linhas.length > 0 && (
        <>
          <GradeKpis>
            <CartaoKpi
              rotulo="Receita total"
              valor={moeda(totais.receita)}
              apoio={`${inteiro(linhas.length)} vendedores ativos`}
            />
            <CartaoKpi
              rotulo="Margem total"
              valor={moeda(totais.margem)}
              apoio="Margem bruta no recorte"
              tom={totais.margem < 0 ? "critico" : "bom"}
            />
            <CartaoKpi
              rotulo="Margem ponderada"
              valor={percentual(totais.margemPct)}
              apoio="Margem total sobre receita total"
            />
            <CartaoKpi
              rotulo="Margem negativa"
              valor={inteiro(totais.negativos)}
              apoio={totais.negativos ? "Vendedores para revisar" : "Nenhuma ocorrência"}
              tom={totais.negativos ? "critico" : "bom"}
            />
          </GradeKpis>

          <Abas
            valor={aba}
            aoMudar={setAba}
            opcoes={[
              { valor: "gerencial", rotulo: "Visão gerencial" },
              { valor: "detalhamento", rotulo: "Detalhamento", contador: linhas.length },
            ]}
          />

          {aba === "gerencial" && (
            <>
              <GradeInsights>
                <PainelInsight
                  titulo="Líder de margem"
                  valor={totais.lider?.vendedor_nome ?? totais.lider?.vendedor_codigo ?? "—"}
                  texto={
                    totais.lider ? `${moeda(totais.lider.margem)} de margem bruta` : "Sem dados"
                  }
                  tom="bom"
                />
                <PainelInsight
                  titulo="Concentração do líder"
                  valor={percentual(
                    totais.margem ? numeroBruto(totais.lider?.margem) / totais.margem : null,
                  )}
                  texto="Participação na margem total"
                />
                <PainelInsight
                  titulo="Pontos de atenção"
                  valor={inteiro(totais.negativos)}
                  texto="Vendedores com margem abaixo de zero"
                  tom={totais.negativos ? "critico" : "bom"}
                />
              </GradeInsights>

              <Secao
                titulo="Ranking de vendedores"
                nota="Dez maiores na métrica selecionada."
                acao={
                  <Segmentado
                    valor={metrica}
                    aoMudar={setMetrica}
                    rotulo="Métrica do ranking"
                    opcoes={[
                      ["margem", "Margem R$"],
                      ["margem_pct", "Margem %"],
                      ["receita", "Receita"],
                    ]}
                  />
                }
              >
                <Grafico
                  opcao={opcao}
                  altura={Math.max(240, Math.min(linhas.length, 10) * 36)}
                  rotuloAcessivel="Ranking dos dez vendedores na métrica selecionada."
                />
              </Secao>
            </>
          )}

          {aba === "detalhamento" && (
            <Secao titulo="Detalhamento" nota="Clique no cabeçalho para ordenar.">
              <Tabela
                linhas={linhas}
                colunas={colunas}
                chaveLinha={(v) => v.vendedor_codigo ?? v.vendedor_nome ?? "—"}
                rotuloAcessivel="Detalhamento por vendedor"
                // A API ja devolve ordenado; a pagina fatia no cliente porque o
                // ranking inteiro cabe na resposta.
                ordenacao={{
                  valor: ordenar,
                  aoMudar: (valor) => {
                    setOffset(0);
                    setOrdenar(valor);
                  },
                }}
                paginacao={{
                  modo: "cliente",
                  total: linhas.length,
                  offset,
                  itensPorPagina,
                  aoMudarOffset: setOffset,
                  aoMudarItensPorPagina: (quantidade) => {
                    setOffset(0);
                    setItensPorPagina(quantidade);
                  },
                }}
              />
            </Secao>
          )}
        </>
      )}
    </>
  );
}
