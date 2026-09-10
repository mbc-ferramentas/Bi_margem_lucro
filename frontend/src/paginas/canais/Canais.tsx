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

import { type Filtros } from "@compartilhado/api/filtros";
import { GRANULARIDADES, type Granularidade } from "@compartilhado/config";
import { useOpcoes } from "@entidades/filtros";
import { useKpis, useSerie } from "@entidades/margem";
import { useMemo } from "react";

import { Label } from "@compartilhado/ui/atomos/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@compartilhado/ui/atomos/select";
import { Grafico, baseDoTema, corDaSerie, type EChartsOption, useOpcaoGrafico } from "@compartilhado/grafico";
import { SkeletonGrafico, SkeletonTiles } from "@compartilhado/ui/moleculas/Skeleton";
import { SeletorPeriodo } from "@compartilhado/ui/moleculas/SeletorPeriodo";
import { AvisoMarketplace, CabecalhoPagina, CartaoKpi, Erro, GradeKpis, Secao, Segmentado, Vazio } from "@compartilhado/ui";
import { useEscolhaUrl, useFiltrosUrl } from "@entidades/filtros";
import { inteiro, moeda, moedaCurta, percentual, rotuloPeriodo } from "@compartilhado/lib/formato";
import {
  granularidadeEfetiva,
  granularidadesPermitidas,
  janelaEfetiva,
} from "@entidades/filtros";

export function Canais() {
  const { data: opcoes } = useOpcoes();
  const canais = opcoes?.opcoes.canais ?? [];
  // O canal escolhido mora na URL: esta e a tela que mais se manda por link
  // ("olha o marketplace de julho"), e em estado local o link chegava no canal
  // errado do outro lado.
  const [filtrosUrl, setFiltros] = useFiltrosUrl();

  const canalAtivo = filtrosUrl.canal ?? canais[0] ?? null;
  // O periodo da URL segue valendo: descartado, o grafico mostrava a base
  // inteira enquanto o resto do BI mostrava o recorte — dois numeros para o
  // mesmo filtro.
  const filtros: Filtros = useMemo(
    () => ({ ...filtrosUrl, canal: canalAtivo ?? undefined }),
    [filtrosUrl, canalAtivo],
  );

  const janela = useMemo(
    () => janelaEfetiva(filtros, opcoes?.opcoes.periodo),
    [filtros, opcoes],
  );
  const [escolhida, setGranularidade] = useEscolhaUrl<Granularidade>(
    "granularidade",
    GRANULARIDADES,
  );
  const granularidade = granularidadeEfetiva(janela, escolhida);

  const kpis = useKpis(filtros);
  const serie = useSerie(filtros, granularidade);

  // useOpcaoGrafico injeta o tema resolvido nas deps: baseDoTema() e
  // corDaSerie() leem as variaveis CSS no momento do calculo.
  const opcao = useOpcaoGrafico<EChartsOption>(() => {
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
        data: pontos.map((p) => rotuloPeriodo(p.periodo, granularidade)),
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
  }, [serie.data, granularidade]);

  const k = kpis.data?.kpis;
  const ehMarketplace = canalAtivo === "Marketplace";

  return (
    <>
      <CabecalhoPagina
        titulo="Por canal"
        descricao="Um canal por vez. A comparação entre canais entra na fase 2, quando a comissão de marketplace estiver lançada."
      />

      {ehMarketplace && kpis.data && (
        <AvisoMarketplace texto={kpis.data.escopo.aviso_marketplace} />
      )}

      <div className="mb-4 flex flex-wrap items-end gap-2.5">
        <div className="flex flex-col gap-1.5">
        <Label htmlFor="sel-canal" className="text-[11px] tracking-wider text-muted-foreground uppercase">
          Canal
        </Label>
        <Select
          value={canalAtivo ?? ""}
          onValueChange={(valor) =>
            setFiltros({ ...filtrosUrl, canal: valor || undefined })
          }
        >
          <SelectTrigger id="sel-canal" size="sm" className="min-w-44">
            <SelectValue placeholder="Selecione um canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {canais.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        </div>

        <SeletorPeriodo
          id="canais-periodo"
          inicio={filtrosUrl.data_inicio}
          fim={filtrosUrl.data_fim}
          base={opcoes?.opcoes.periodo}
          aoMudar={({ inicio, fim }) =>
            setFiltros({ ...filtrosUrl, data_inicio: inicio, data_fim: fim })
          }
        />
      </div>

      {kpis.isError && <Erro mensagem={(kpis.error as Error).message} />}
      {kpis.isPending && <SkeletonTiles quantidade={3} />}

      {k && (
        <GradeKpis>
          <CartaoKpi
            rotulo="Receita bruta"
            valor={moeda(k.receita_bruta)}
            apoio={`${inteiro(k.pedidos)} pedidos`}
          />
          <CartaoKpi
            rotulo="Margem bruta"
            valor={moeda(k.margem_bruta)}
            apoio={`${percentual(k.margem_pct)}${ehMarketplace ? " — antes da comissão" : ""}`}
          />
          <CartaoKpi
            rotulo="Ticket médio"
            valor={moeda(k.ticket_medio)}
            apoio={`${inteiro(k.skus)} SKUs distintos`}
          />
        </GradeKpis>
      )}

      {serie.isPending && <SkeletonGrafico altura={280} />}
      {serie.isError && <Erro mensagem={(serie.error as Error).message} />}
      {serie.data &&
        (serie.data.serie.length === 0 ? (
          <Vazio mensagem="Nenhum faturamento neste canal no período." />
        ) : (
          <Secao
            titulo={`Margem bruta — ${canalAtivo}`}
            nota="Somente este canal. Nenhuma outra série no gráfico."
            acao={
              <Segmentado
                valor={granularidade}
                aoMudar={setGranularidade}
                rotulo="Agregação do tempo"
                desabilitadas={GRANULARIDADES.filter(
                  (g) => !granularidadesPermitidas(janela).includes(g),
                )}
                opcoes={[
                  ["dia", "Dia"],
                  ["semana", "Semana"],
                  ["mes", "Mês"],
                ]}
              />
            }
          >
            <Grafico
              opcao={opcao}
              altura={280}
              rotuloAcessivel={`Margem bruta do canal ${canalAtivo}, agregada por ${granularidade}.`}
            />
          </Secao>
        ))}
    </>
  );
}
