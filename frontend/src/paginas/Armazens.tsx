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

import { LinhaArmazem, useArmazens } from "@entidades/armazem";
import { ChevronRightIcon, EyeIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

import { Button } from "@compartilhado/ui/atomos/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@compartilhado/ui/atomos/collapsible";
import { cn } from "@compartilhado/lib/utils";
import { BarraFiltros } from "@widgets/barra-filtros";
import { Grafico, baseDoTema, corDaSerie, token, type EChartsOption, useOpcaoGrafico } from "@compartilhado/grafico";
import { SkeletonTabela } from "@compartilhado/ui/moleculas/Skeleton";
import { Tabela, type Coluna } from "@compartilhado/ui/organismos/Tabela";
import { Abas, CartaoKpi, Erro, GradeKpis, Secao, Segmentado, Vazio } from "@compartilhado/ui";
import { CabecalhoPagina } from "@widgets/cabecalho-pagina";
import { escreverFiltros, useAbaUrl, useFiltrosUrl } from "../filtrosUrl";
import { inteiro, moeda, moedaCurta, numeroBruto, percentual } from "@compartilhado/lib/formato";

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

  // useOpcaoGrafico injeta o tema resolvido nas deps: baseDoTema() e
  // corDaSerie() leem as variaveis CSS no momento do calculo.
  const opcao = useOpcaoGrafico<EChartsOption>(() => {
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
        splitLine: { lineStyle: { color: token("--grid") } },
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
        // Barra empilhada leva um fio da cor da superficie entre os segmentos:
        // sem ele dois grupos de cores proximas viram um bloco so.
        itemStyle: {
          color: corDaSerie(indice),
          borderColor: token("--card"),
          borderWidth: 2,
        },
        data: ordenados.map((bloco) => {
          const valor = numeroBruto(bloco.grupos.find((g) => (g.grupo_rotulo ?? "—") === grupo)?.margem ?? 0);
          return modoGrafico === "participacao" && bloco.margem ? (valor / bloco.margem) * 100 : valor;
        }),
      })),
    };
  }, [blocos, linhas, modoGrafico]);

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
          <GradeKpis>
            <CartaoKpi rotulo="Receita total" valor={moeda(totais.receita)} apoio={`${inteiro(blocos.length)} armazéns no recorte`} />
            <CartaoKpi rotulo="Margem total" valor={moeda(totais.margem)} apoio="Margem bruta consolidada" tom={totais.margem < 0 ? "critico" : "bom"} />
            <CartaoKpi rotulo="Margem ponderada" valor={percentual(totais.margemPct)} apoio="Margem total sobre receita total" />
            <CartaoKpi rotulo="Maior contribuição" valor={totais.lider?.rotulo ?? "—"} apoio={`${percentual(totais.participacaoLider)} da margem total`} />
          </GradeKpis>

          <Abas valor={aba} aoMudar={setAba} opcoes={[{ valor: "gerencial", rotulo: "Visão gerencial" }, { valor: "detalhamento", rotulo: "Detalhamento", contador: blocos.length }]} />

          {aba === "gerencial" && (
            <Secao
              titulo="Composição da margem"
              nota="Empilhada por grupo; a escala absoluta preserva a diferença real entre armazéns."
              acao={
                <Segmentado
                  valor={modoGrafico}
                  aoMudar={setModoGrafico}
                  rotulo="Escala do gráfico"
                  opcoes={[
                    ["valor", "Valor absoluto"],
                    ["participacao", "Participação %"],
                  ]}
                />
              }
            >
              <Grafico
                opcao={opcao}
                altura={Math.max(240, blocos.length * 46)}
                rotuloAcessivel="Margem por armazém, empilhada por grupo."
              />
            </Secao>
          )}

          {aba === "detalhamento" && (
            <Secao
              titulo="Armazéns e grupos"
              nota="Expanda um armazém para consultar a composição por grupo."
            >
              <div className="flex flex-col gap-2">
                {blocos.map((bloco, indice) => (
                  <Fragmento
                    key={bloco.codigo}
                    bloco={bloco}
                    consulta={consulta}
                    abertoInicial={indice === 0}
                  />
                ))}
              </div>
            </Secao>
          )}
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

  const colunas: readonly Coluna<LinhaArmazem>[] = [
    {
      chave: null,
      rotulo: "Grupo",
      fixa: true,
      celula: (g) => g.grupo_rotulo ?? g.grupo_codigo ?? "—",
    },
    { chave: null, rotulo: "Receita", num: true, celula: (g) => moeda(g.receita) },
    { chave: null, rotulo: "Custo", num: true, celula: (g) => moeda(g.custo) },
    {
      chave: null,
      rotulo: "Margem",
      num: true,
      negativo: (g) => numeroBruto(g.margem) < 0,
      celula: (g) => moeda(g.margem),
    },
    { chave: null, rotulo: "Margem %", num: true, celula: (g) => percentual(g.margem_pct) },
    { chave: null, rotulo: "Linhas", num: true, celula: (g) => inteiro(g.linhas) },
  ];

  return (
    <Collapsible
      open={aberto}
      onOpenChange={setAberto}
      className="overflow-hidden rounded-lg border bg-card"
    >
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="grid w-full grid-cols-2 items-center gap-3.5 px-3.5 py-3 text-left hover:bg-accent md:[grid-template-columns:minmax(180px,1.5fr)_repeat(4,minmax(100px,1fr))_auto]"
          />
        }
      >
        <strong className="flex items-center gap-1.5">
          <ChevronRightIcon
            className={cn("size-4 transition-transform", aberto && "rotate-90")}
            aria-hidden="true"
          />
          {bloco.rotulo}
        </strong>
        <Metrica rotulo="Receita" valor={moeda(bloco.receita)} />
        <Metrica rotulo="Custo" valor={moeda(bloco.custo)} />
        <Metrica rotulo="Margem" valor={moeda(bloco.margem)} negativo={bloco.margem < 0} />
        <Metrica rotulo="Margem %" valor={pct(bloco.margem, bloco.receita)} />
        <span className="text-xs text-muted-foreground">
          {inteiro(bloco.grupos.length)} grupos
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="px-3.5 pb-3">
        {/* A acao de visualizar mora na linha do armazem, nao na do grupo: o
            drill-down e para o pedido faturado, e pedido e do armazem — o mesmo
            pedido pode carregar itens de varios grupos. `consulta` leva os
            filtros da tela junto, para a lista abrir com o mesmo recorte que
            produziu o numero clicado. */}
        <div className="mb-2 flex justify-end">
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={
              <Link to={`/armazens/${bloco.codigo}/pedidos${consulta ? `?${consulta}` : ""}`} />
            }
          >
            <EyeIcon data-icon="inline-start" />
            Ver pedidos
          </Button>
        </div>
        <Tabela
          linhas={bloco.grupos}
          colunas={colunas}
          chaveLinha={(g) => `${bloco.codigo}-${g.grupo_codigo}`}
          rotuloAcessivel={`Grupos do armazém ${bloco.rotulo}`}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

function Metrica({ rotulo, valor, negativo }: { rotulo: string; valor: string; negativo?: boolean }) {
  return (
    <span className="num-tabular text-right">
      <small className="block text-[10px] tracking-wide text-muted-foreground uppercase">
        {rotulo}
      </small>
      <span className={cn(negativo && "text-destructive")}>{valor}</span>
    </span>
  );
}
