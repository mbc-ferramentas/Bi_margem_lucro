/** A serie no tempo, com a alternativa em tabela e o drill-down por periodo.
 *
 *  E o bloco com mais estado da tela: metrica, forma de exibicao, paginacao da
 *  tabela e a pilha de zoom do periodo. Tudo isso continua vindo da pagina, que
 *  e quem sabe que estreitar o periodo aqui estreita o recorte inteiro. */

import { Grafico, type EChartsOption } from "@compartilhado/grafico";
import type { Granularidade } from "@compartilhado/config";
import { Button } from "@compartilhado/ui/atomos/button";
import { Erro, Secao, Segmentado, Vazio } from "@compartilhado/ui";
import { SkeletonGrafico } from "@compartilhado/ui/moleculas/Skeleton";
import { Tabela, type Coluna } from "@compartilhado/ui/organismos/Tabela";
import type { PontoSerie } from "@entidades/margem";

import { METRICAS, type Metrica } from "../modelo/metricas";

export function EvolucaoNoTempo({
  serie,
  colunas,
  opcao,
  granularidade,
  metrica,
  setMetrica,
  modo,
  setModo,
  offsetTabela,
  setOffsetTabela,
  itensPorPagina,
  setItensPorPagina,
  pilhaZoom,
  detalharPeriodo,
  voltarPeriodo,
}: {
  serie: {
    data: { serie: PontoSerie[] } | undefined;
    isPending: boolean;
    isError: boolean;
    error: unknown;
  };
  colunas: readonly Coluna<PontoSerie>[];
  opcao: EChartsOption;
  granularidade: Granularidade;
  metrica: Metrica;
  setMetrica: (m: Metrica) => void;
  modo: "grafico" | "tabela";
  setModo: (m: "grafico" | "tabela") => void;
  offsetTabela: number;
  setOffsetTabela: (n: number) => void;
  itensPorPagina: number;
  setItensPorPagina: (n: number) => void;
  pilhaZoom: readonly unknown[];
  detalharPeriodo: (marca: { nome: string; serie: number; indice: number }) => void;
  voltarPeriodo: () => void;
}) {
  return (
    <>

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
    </>
  );
}
