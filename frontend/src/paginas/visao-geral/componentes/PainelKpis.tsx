/** Os cinco numeros do topo: o destaque de margem e a grade de apoio.
 *
 *  Recebe a consulta ja serializada em vez de montar o recorte por conta
 *  propria — cada cartao leva o filtro vigente para a tela de destino, e e isso
 *  que faz o KPI ser um ponto de partida e nao um numero solto. */

import { useNavigate } from "react-router";

import { Sparkline } from "@compartilhado/grafico";
import {
  inteiro,
  moeda,
  numeroBruto,
  percentual,
} from "@compartilhado/lib/formato";
import {
  CartaoDestaque,
  CartaoKpi,
  Delta,
  Erro,
  GradeKpis,
} from "@compartilhado/ui";
import { SkeletonTiles } from "@compartilhado/ui/moleculas/Skeleton";
import type { Kpis } from "@entidades/margem";

import { valorOuNulo } from "../modelo/metricas";

export function PainelKpis({
  kpis,
  k,
  kAnterior,
  referencia,
  tendencia,
  consulta,
  irParaArmazens,
}: {
  kpis: {
    isError: boolean;
    error: unknown;
    isPending: boolean;
    isFetching: boolean;
  };
  k: Kpis | undefined;
  kAnterior: Kpis | undefined;
  referencia: string | null;
  tendencia: number[];
  consulta: string;
  irParaArmazens: () => void;
}) {
  const navegar = useNavigate();

  return (
    <>

      {kpis.isError && <Erro mensagem={(kpis.error as Error).message} />}
      {kpis.isPending && <SkeletonTiles quantidade={4} />}

      {k && (
        // Refetch nao volta ao esqueleto: o numero anterior fica na tela em meio
        // tom ate o novo chegar. Piscar o esqueleto a cada filtro faz a pagina
        // saltar e custa a leitura que ja estava em andamento.
        <div
          className={
            kpis.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"
          }
        >
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] 2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,2fr)]">
            <CartaoDestaque
              rotulo="Margem bruta"
              valor={moeda(k.margem_bruta)}
              secundario={percentual(k.margem_pct)}
              tom={numeroBruto(k.margem_bruta) < 0 ? "critico" : "bom"}
              apoio={`Sobre ${moeda(k.receita_bruta)} de receita bruta · ${inteiro(
                k.pedidos,
              )} pedidos · ${inteiro(k.skus)} SKUs`}
              delta={
                <Delta
                  atual={valorOuNulo(k.margem_pct)}
                  anterior={valorOuNulo(kAnterior?.margem_pct)}
                  formato="pontos"
                  referencia={referencia}
                />
              }
              rodape={
                <Sparkline
                  valores={tendencia}
                  rotuloAcessivel="Tendência da margem bruta mês a mês no período filtrado."
                />
              }
            />

            <GradeKpis colunas={2} margem={false}>
              <CartaoKpi
                rotulo="Receita bruta"
                valor={moeda(k.receita_bruta)}
                apoio={`${inteiro(k.linhas)} linhas no cálculo`}
                aoClicar={irParaArmazens}
                delta={
                  <Delta
                    atual={valorOuNulo(k.receita_bruta)}
                    anterior={valorOuNulo(kAnterior?.receita_bruta)}
                    referencia={referencia}
                  />
                }
              />
              <CartaoKpi
                rotulo="Custo total"
                valor={moeda(k.custo_total)}
                apoio={`${inteiro(k.quantidade)} unidades`}
                aoClicar={() => navegar(`/skus${consulta ? `?${consulta}` : ""}`)}
                delta={
                  // `inverter`: custo que sobe nao e boa noticia, e pintar de
                  // verde uma alta de custo seria pior do que nao pintar nada.
                  <Delta
                    atual={valorOuNulo(k.custo_total)}
                    anterior={valorOuNulo(kAnterior?.custo_total)}
                    inverter
                    referencia={referencia}
                  />
                }
              />
              <CartaoKpi
                rotulo="Ticket médio"
                valor={moeda(k.ticket_medio)}
                apoio="Receita bruta ÷ pedidos"
                aoClicar={() => navegar(`/vendedores${consulta ? `?${consulta}` : ""}`)}
                delta={
                  <Delta
                    atual={valorOuNulo(k.ticket_medio)}
                    anterior={valorOuNulo(kAnterior?.ticket_medio)}
                    referencia={referencia}
                  />
                }
              />
              <CartaoKpi
                rotulo="Pedidos"
                valor={inteiro(k.pedidos)}
                apoio={`${inteiro(k.skus)} SKUs distintos`}
                aoClicar={() => navegar(`/canais${consulta ? `?${consulta}` : ""}`)}
                delta={
                  <Delta
                    atual={k.pedidos}
                    anterior={kAnterior ? kAnterior.pedidos : null}
                    referencia={referencia}
                  />
                }
              />
            </GradeKpis>
          </div>
        </div>
      )}
    </>
  );
}
