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

import type { EChartsOption } from "echarts";

import { useKpis, useOpcoes, useSerie } from "../api/hooks";
import type { Filtros } from "../api/tipos";
import { Label } from "@/componentes/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/componentes/ui/select";
import { Grafico, baseDoTema, corDaSerie, useOpcaoGrafico } from "../componentes/Grafico";
import { AvisoMarketplace, Erro, Vazio } from "../componentes/Layout";
import { SkeletonGrafico, SkeletonTiles } from "../componentes/Skeleton";
import { CabecalhoPagina, CartaoKpi, GradeKpis, Secao } from "../componentes/Visual";
import { useFiltrosUrl } from "../filtrosUrl";
import { dataCurta, inteiro, moeda, moedaCurta, percentual } from "../formato";

export function Canais() {
  const { data: opcoes } = useOpcoes();
  const canais = opcoes?.opcoes.canais ?? [];
  // O canal escolhido mora na URL: esta e a tela que mais se manda por link
  // ("olha o marketplace de julho"), e em estado local o link chegava no canal
  // errado do outro lado.
  const [filtrosUrl, setFiltros] = useFiltrosUrl();

  const canalAtivo = filtrosUrl.canal ?? canais[0] ?? null;
  const filtros: Filtros = canalAtivo ? { canal: canalAtivo } : {};

  const kpis = useKpis(filtros);
  const serie = useSerie(filtros, "dia");

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
        data: pontos.map((p) => dataCurta(p.periodo)),
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
  }, [serie.data]);

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

      <div className="mb-4 flex flex-col gap-1.5">
        <Label htmlFor="sel-canal" className="text-[11px] tracking-wider text-muted-foreground uppercase">
          Canal
        </Label>
        <Select
          value={canalAtivo ?? ""}
          onValueChange={(valor) => setFiltros(valor ? { canal: valor } : {})}
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
            titulo={`Margem bruta diária — ${canalAtivo}`}
            nota="Somente este canal. Nenhuma outra série no gráfico."
          >
            <Grafico
              opcao={opcao}
              altura={280}
              rotuloAcessivel={`Margem bruta diária do canal ${canalAtivo}.`}
            />
          </Secao>
        ))}
    </>
  );
}
