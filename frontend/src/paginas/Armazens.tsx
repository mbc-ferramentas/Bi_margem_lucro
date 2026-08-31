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
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useArmazens } from "../api/hooks";
import type { LinhaArmazem } from "../api/tipos";
import { BarraFiltros } from "../componentes/Filtros";
import { Grafico, baseDoTema, corDaSerie } from "../componentes/Grafico";
import { IconeOlho } from "../componentes/Icones";
import { Erro, Vazio } from "../componentes/Layout";
import { SkeletonTabela } from "../componentes/Skeleton";
import { Abas, CabecalhoPagina, CartaoKpi } from "../componentes/Visual";
import { escreverFiltros, useAbaUrl, useFiltrosUrl } from "../filtrosUrl";
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
  const [aba, setAba] = useAbaUrl(["gerencial", "detalhamento"] as const, "gerencial");
  const [modoGrafico, setModoGrafico] = useState<"valor" | "participacao">("valor");
  const totais = useMemo(() => {
    const receita = blocos.reduce((s, b) => s + b.receita, 0);
    const margem = blocos.reduce((s, b) => s + b.margem, 0);
    return { receita, margem, margemPct: receita ? margem / receita : null, lider: blocos[0], participacaoLider: margem ? (blocos[0]?.margem ?? 0) / margem : null };
  }, [blocos]);

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
      tooltip: { ...base.tooltip, valueFormatter: (v) => modoGrafico === "participacao" ? percentual(Number(v) / 100) : moeda(v as number) },
      legend: { ...base.legend, show: grupos.length > 1 },
      xAxis: {
        ...base.xAxis,
        type: "value",
        max: modoGrafico === "participacao" ? 100 : undefined,
        axisLabel: { ...base.xAxis.axisLabel, formatter: (v: number) => modoGrafico === "participacao" ? `${v}%` : moedaCurta(v) },
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
        data: ordenados.map((bloco) => {
          const valor = numeroBruto(bloco.grupos.find((g) => (g.grupo_rotulo ?? "—") === grupo)?.margem ?? 0);
          return modoGrafico === "participacao" && bloco.margem ? (valor / bloco.margem) * 100 : valor;
        }),
      })),
    };
  }, [blocos, linhas, modoGrafico, resolvido]);

  return (
    <>
      <CabecalhoPagina titulo="Por armazém" descricao="Entenda onde a margem é gerada e como cada grupo participa do resultado de cada operação." />

      <BarraFiltros valor={filtros} aoMudar={setFiltros} />

      {isError && <Erro mensagem={(error as Error).message} />}
      {isPending && <SkeletonTabela linhas={10} colunas={7} />}

      {data && blocos.length === 0 && (
        <Vazio mensagem="Nenhuma venda para os filtros selecionados." />
      )}

      {blocos.length > 0 && (
        <>
          <div className="grade-kpis">
            <CartaoKpi rotulo="Receita total" valor={moeda(totais.receita)} apoio={`${inteiro(blocos.length)} armazéns no recorte`} />
            <CartaoKpi rotulo="Margem total" valor={moeda(totais.margem)} apoio="Margem bruta consolidada" tom={totais.margem < 0 ? "critico" : "bom"} />
            <CartaoKpi rotulo="Margem ponderada" valor={percentual(totais.margemPct)} apoio="Margem total sobre receita total" />
            <CartaoKpi rotulo="Maior contribuição" valor={totais.lider?.rotulo ?? "—"} apoio={`${percentual(totais.participacaoLider)} da margem total`} />
          </div>

          <Abas valor={aba} aoMudar={setAba} opcoes={[{ valor: "gerencial", rotulo: "Visão gerencial" }, { valor: "detalhamento", rotulo: "Detalhamento", contador: blocos.length }]} />

          {aba === "gerencial" && <div className="cartao">
            <div className="secao-topo"><div><h2>Composição da margem</h2><p className="nota">Empilhada por grupo; a escala absoluta preserva a diferença real entre armazéns.</p></div><div className="segmented" aria-label="Escala do gráfico"><button aria-pressed={modoGrafico === "valor"} onClick={() => setModoGrafico("valor")}>Valor absoluto</button><button aria-pressed={modoGrafico === "participacao"} onClick={() => setModoGrafico("participacao")}>Participação %</button></div></div>
            <Grafico opcao={opcao} altura={Math.max(240, blocos.length * 46)} rotuloAcessivel="Margem por armazém, empilhada por grupo." />
          </div>}

          {aba === "detalhamento" && <div className="cartao">
            <h2>Armazéns e grupos</h2>
            <p className="nota">Expanda um armazém para consultar a composição por grupo.</p>
            <div>
              {blocos.map((bloco, indice) => <Fragmento key={bloco.codigo} bloco={bloco} consulta={consulta} abertoInicial={indice === 0} />)}
            </div>
          </div>}
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
function Fragmento({ bloco, consulta, abertoInicial }: { bloco: Bloco; consulta: string; abertoInicial: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial);
  return (
    <section className="armazem-bloco">
      <button className="armazem-resumo" type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        <strong>{aberto ? "▾" : "▸"} {bloco.rotulo}</strong>
        <span className="armazem-metrica"><small>Receita</small>{moeda(bloco.receita)}</span>
        <span className="armazem-metrica"><small>Custo</small>{moeda(bloco.custo)}</span>
        <span className={bloco.margem < 0 ? "armazem-metrica negativo" : "armazem-metrica"}><small>Margem</small>{moeda(bloco.margem)}</span>
        <span className="armazem-metrica"><small>Margem %</small>{pct(bloco.margem, bloco.receita)}</span>
        <span>{inteiro(bloco.grupos.length)} grupos</span>
      </button>
      {aberto && <div className="armazem-conteudo">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}><Link className="acao-visualizar" to={`/armazens/${bloco.codigo}/pedidos${consulta ? `?${consulta}` : ""}`}><IconeOlho /> Ver pedidos</Link></div>
        <div className="rolagem"><table><thead><tr><th>Grupo</th><th className="num">Receita</th><th className="num">Custo</th><th className="num">Margem</th><th className="num">Margem %</th><th className="num">Linhas</th></tr></thead><tbody>
          {bloco.grupos.map((grupo) => <tr key={`${bloco.codigo}-${grupo.grupo_codigo}`}><td className="tabela-identidade">{grupo.grupo_rotulo ?? grupo.grupo_codigo ?? "—"}</td><td className="num">{moeda(grupo.receita)}</td><td className="num">{moeda(grupo.custo)}</td><td className={numeroBruto(grupo.margem) < 0 ? "num negativo" : "num"}>{moeda(grupo.margem)}</td><td className="num">{percentual(grupo.margem_pct)}</td><td className="num">{inteiro(grupo.linhas)}</td></tr>)}
        </tbody></table></div>
      </div>}
    </section>
  );
}
