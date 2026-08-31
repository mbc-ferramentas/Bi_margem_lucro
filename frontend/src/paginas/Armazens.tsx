/** Margem por armazem, aberta em grupo.
 *
 *  E a leitura principal do BI: o mesmo grupo aparece em varios armazens, entao
 *  grupo sozinho nao organiza a analise. Armazem por fora, grupo por dentro.
 *
 *  A escala e deliberadamente honesta: o Barracao 02 concentra quase toda a
 *  operacao, e o grafico mostra isso em vez de esconder a diferenca com escala
 *  logaritmica. Quem precisa comparar os armazens pequenos entre si filtra por
 *  eles — a barra de filtros recorta o grafico junto.
 */

import type { EChartsOption } from "echarts";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { useArmazens } from "../api/hooks";
import type { LinhaArmazem } from "../api/tipos";
import { BarraFiltros } from "../componentes/Filtros";
import { Grafico, baseDoTema, corDaSerie } from "../componentes/Grafico";
import { IconeOlho } from "../componentes/Icones";
import { Erro, Vazio } from "../componentes/Layout";
import { SeletorTema } from "../componentes/SeletorTema";
import { SkeletonTabela } from "../componentes/Skeleton";
import { escreverFiltros, useFiltrosUrl } from "../filtrosUrl";
import { inteiro, moeda, moedaCurta, numeroBruto, percentual } from "../formato";
import { useTema } from "../tema";

type Bloco = {
  codigo: string;
  rotulo: string;
  grupos: LinhaArmazem[];
  receita: number;
  custo: number;
  margem: number;
  linhas: number;
};

/** Agrupa as linhas planas da API em armazem -> grupos, somando os totais. */
function aninhar(linhas: LinhaArmazem[]): Bloco[] {
  const blocos = new Map<string, Bloco>();

  for (const linha of linhas) {
    const codigo = linha.armazem ?? "—";
    let bloco = blocos.get(codigo);
    if (!bloco) {
      bloco = {
        codigo,
        rotulo: linha.armazem_rotulo ?? codigo,
        grupos: [],
        receita: 0,
        custo: 0,
        margem: 0,
        linhas: 0,
      };
      blocos.set(codigo, bloco);
    }
    bloco.grupos.push(linha);
    bloco.receita += numeroBruto(linha.receita);
    bloco.custo += numeroBruto(linha.custo);
    bloco.margem += numeroBruto(linha.margem);
    bloco.linhas += linha.linhas;
  }

  for (const bloco of blocos.values()) {
    bloco.grupos.sort((a, b) => numeroBruto(b.margem) - numeroBruto(a.margem));
  }
  return [...blocos.values()].sort((a, b) => b.margem - a.margem);
}

function pct(margem: number, receita: number): string {
  return receita === 0 ? "—" : percentual(margem / receita);
}

export function Armazens() {
  // Filtros na URL e nao em estado: e o que faz o drill-down voltar para a tela
  // exatamente como ela estava (ver `filtrosUrl.ts`).
  const [filtros, setFiltros] = useFiltrosUrl();
  const consulta = escreverFiltros(filtros);
  const { data, isPending, isError, error } = useArmazens(filtros, "-margem");
  const linhas = data?.armazens ?? [];
  const blocos = useMemo(() => aninhar(linhas), [linhas]);

  // Ver a nota em VisaoGeral: `resolvido` entra nas deps porque baseDoTema() e
  // corDaSerie() leem as variaveis CSS no momento do calculo.
  const { resolvido } = useTema();

  const opcao = useMemo<EChartsOption>(() => {
    const base = baseDoTema();
    // Ordem crescente: a barra category do ECharts cresce de baixo para cima.
    const ordenados = [...blocos].reverse();
    const grupos = [...new Set(linhas.map((l) => l.grupo_rotulo ?? "—"))].sort();

    return {
      ...base,
      grid: { ...base.grid, left: 8, right: 24 },
      tooltip: { ...base.tooltip, valueFormatter: (v) => moeda(v as number) },
      legend: { ...base.legend, show: grupos.length > 1 },
      xAxis: {
        ...base.xAxis,
        type: "value",
        axisLabel: { ...base.xAxis.axisLabel, formatter: (v: number) => moedaCurta(v) },
        splitLine: { lineStyle: { color: "var(--grid)" } },
      },
      yAxis: {
        ...base.yAxis,
        type: "category",
        data: ordenados.map((b) => b.rotulo),
        splitLine: { show: false },
      },
      series: grupos.map((grupo, indice) => ({
        name: grupo,
        type: "bar" as const,
        stack: "margem",
        barMaxWidth: 18,
        itemStyle: { color: corDaSerie(indice) },
        data: ordenados.map((bloco) =>
          numeroBruto(
            bloco.grupos.find((g) => (g.grupo_rotulo ?? "—") === grupo)?.margem ?? 0,
          ),
        ),
      })),
    };
  }, [blocos, linhas, resolvido]);

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Por armazém</h1>
          <p className="subtitulo">
            Margem bruta por armazém, aberta em grupo. O mesmo grupo vende por mais
            de um armazém — é o armazém que organiza a leitura.
          </p>
        </div>
        <SeletorTema />
      </div>

      <BarraFiltros valor={filtros} aoMudar={setFiltros} />

      {isError && <Erro mensagem={(error as Error).message} />}
      {isPending && <SkeletonTabela linhas={10} colunas={7} />}

      {data && blocos.length === 0 && (
        <Vazio mensagem="Nenhuma venda para os filtros selecionados." />
      )}

      {blocos.length > 0 && (
        <>
          <div className="cartao">
            <h2>Margem por armazém</h2>
            <p className="nota">
              Empilhado por grupo. A diferença de escala entre os armazéns é real:
              filtre um armazém para comparar os menores entre si.
            </p>
            <Grafico
              opcao={opcao}
              altura={Math.max(220, blocos.length * 44)}
              rotuloAcessivel="Margem bruta por armazém, empilhada por grupo."
            />
          </div>

          <div className="cartao" style={{ marginTop: 14 }}>
            <h2>Detalhamento</h2>
            <p className="nota">
              Cada armazém traz seus grupos abaixo. Os totais são do armazém inteiro.
            </p>
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Armazém / grupo</th>
                    <th className="num">Receita</th>
                    <th className="num">Custo</th>
                    <th className="num">Margem</th>
                    <th className="num">Margem %</th>
                    <th className="num">Linhas</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {blocos.map((bloco) => (
                    <Fragmento key={bloco.codigo} bloco={bloco} consulta={consulta} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** Um armazém: a linha de total, seguida de uma linha por grupo.
 *
 *  A ação de visualizar mora na linha do armazém, não na do grupo: o drill-down é
 *  para o pedido faturado, e pedido é do armazém — o mesmo pedido pode carregar
 *  itens de vários grupos. `consulta` leva os filtros da tela junto, para a lista
 *  abrir com o mesmo recorte que produziu o número clicado.
 */
function Fragmento({ bloco, consulta }: { bloco: Bloco; consulta: string }) {
  return (
    <>
      <tr>
        <td style={{ fontWeight: 600 }}>{bloco.rotulo}</td>
        <td className="num" style={{ fontWeight: 600 }}>
          {moeda(bloco.receita)}
        </td>
        <td className="num" style={{ fontWeight: 600 }}>
          {moeda(bloco.custo)}
        </td>
        <td
          className={bloco.margem < 0 ? "num negativo" : "num"}
          style={{ fontWeight: 600 }}
        >
          {moeda(bloco.margem)}
        </td>
        <td className="num" style={{ fontWeight: 600 }}>
          {pct(bloco.margem, bloco.receita)}
        </td>
        <td className="num" style={{ fontWeight: 600 }}>
          {inteiro(bloco.linhas)}
        </td>
        <td className="acoes">
          <Link
            className="botao-alt acao-visualizar"
            to={`/armazens/${bloco.codigo}/pedidos${consulta ? `?${consulta}` : ""}`}
            aria-label={`Visualizar pedidos faturados de ${bloco.rotulo}`}
          >
            <IconeOlho />
            Visualizar
          </Link>
        </td>
      </tr>
      {bloco.grupos.map((grupo) => (
        <tr key={`${bloco.codigo}-${grupo.grupo_codigo}`}>
          <td style={{ paddingLeft: 26, color: "var(--text-secondary)" }}>
            {grupo.grupo_rotulo ?? grupo.grupo_codigo ?? "—"}
          </td>
          <td className="num">{moeda(grupo.receita)}</td>
          <td className="num">{moeda(grupo.custo)}</td>
          <td className={numeroBruto(grupo.margem) < 0 ? "num negativo" : "num"}>
            {moeda(grupo.margem)}
          </td>
          <td className="num">{percentual(grupo.margem_pct)}</td>
          <td className="num">{inteiro(grupo.linhas)}</td>
          <td />
        </tr>
      ))}
    </>
  );
}
