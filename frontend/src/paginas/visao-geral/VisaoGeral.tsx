/** Visão geral — a leitura de diretoria.
 *
 *  A tela responde, nesta ordem, às quatro perguntas de quem abre o BI e tem
 *  cinco minutos: **quanto sobrou** (o destaque), **como se formou** (a
 *  cascata), **para onde está indo** (a evolução), **de onde vem e onde escapa**
 *  (armazém e SKU) e **o que ainda vai faturar** (a carteira).
 *
 *  Hierarquia é a decisão de projeto principal: antes eram sete cartões do mesmo
 *  tamanho, e um painel em que todo número tem o mesmo peso não tem resposta —
 *  tem inventário. Aqui a margem bruta é o número da tela, e todo o resto é
 *  contexto dela.
 *
 *  A comparação com o período anterior é calculada no cliente (`periodo.ts` +
 *  uma segunda chamada a `/kpis`): a API não tem endpoint de comparativo, mas
 *  responde qualquer janela.
 *
 *  Fase 1: margem **bruta**. O canal Marketplace não tem a comissão lançada, e é
 *  por isso que o aviso fica no topo e se repete na nota do gráfico por canal.
 */

import { Filtros } from "@compartilhado/api/filtros";
import { useArmazens } from "@entidades/armazem";
import { useCarteira } from "@entidades/carteira";
import { useOpcoes } from "@entidades/filtros";
import { useKpis, useSerie } from "@entidades/margem";
import { useSkus } from "@entidades/sku";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { BarraFiltros } from "@widgets/barra-filtros";
import { type EChartsOption, useOpcaoGrafico } from "@compartilhado/grafico";
import { AvisoMarketplace, Badge } from "@compartilhado/ui";
import { CabecalhoPagina } from "@widgets/cabecalho-pagina";
import { escreverFiltros, useFiltrosUrl } from "@entidades/filtros";
import { numeroBruto, rotulosDoPeriodo } from "@compartilhado/lib/formato";
import { type Janela, fatiaDoPeriodo, granularidadeAuto, janelaEfetiva, periodoAnterior, rotuloJanela } from "@entidades/filtros";

import { extremosDeSku, totaisPorArmazem } from "./modelo/agregacoes";
import { CarteiraEmAberto } from "./componentes/CarteiraEmAberto";
import { EvolucaoNoTempo } from "./componentes/EvolucaoNoTempo";
import { FormacaoDaMargem } from "./componentes/FormacaoDaMargem";
import { PainelDimensoes } from "./componentes/PainelDimensoes";
import { PainelKpis } from "./componentes/PainelKpis";
import { colunasDaSerie } from "./modelo/colunas";
import { opcaoArmazens, opcaoDeSkus, opcaoEvolucao } from "./modelo/graficos";
import { TOPO_SKU, type Metrica } from "./modelo/metricas";

export function VisaoGeral() {
  // Filtros na URL como nas demais telas: com useState local, o link da visao
  // geral filtrada nao carregava o recorte para quem o recebia.
  const [filtros, setFiltros] = useFiltrosUrl();
  const [modo, setModo] = useState<"grafico" | "tabela">("grafico");
  const [metrica, setMetrica] = useState<Metrica>("margem");
  const [offsetTabela, setOffsetTabela] = useState(0);
  const [itensPorPagina, setItensPorPagina] = useState(25);
  const navegar = useNavigate();
  const consulta = escreverFiltros(filtros);

  const opcoes = useOpcoes();
  const periodoBase = opcoes.data?.opcoes.periodo;

  const janela = useMemo(() => janelaEfetiva(filtros, periodoBase), [filtros, periodoBase]);
  const anterior = useMemo(() => periodoAnterior(filtros, periodoBase), [filtros, periodoBase]);

  const granularidade = granularidadeAuto(janela);

  const [pilhaZoom, setPilhaZoom] = useState<(Janela | null)[]>([]);

  const kpis = useKpis(filtros);
  const kpisAnterior = useKpis(anterior ?? {}, Boolean(anterior));
  const serie = useSerie(filtros, granularidade);
  const armazens = useArmazens(filtros, "-margem");
  const melhores = useSkus(filtros, "-margem", 0, TOPO_SKU);
  const piores = useSkus(filtros, "margem", 0, TOPO_SKU);
  // A carteira ignora o periodo de proposito: la a data filtrada e a **entrega
  // prometida**, nao a emissao da nota. Herdar um mes ja faturado mostraria uma
  // carteira vazia sem explicar por que. As demais dimensoes seguem valendo.
  const filtrosCarteira = useMemo(
    () => ({ ...filtros, data_inicio: undefined, data_fim: undefined }),
    [filtros],
  );
  // Uma linha so: a tela usa apenas o `resumo`, que a API calcula sobre o
  // conjunto filtrado inteiro e nao sobre a pagina.
  const carteira = useCarteira(filtrosCarteira, "-valor", 0, 1);

  const k = kpis.data?.kpis;
  const kAnterior = anterior ? kpisAnterior.data?.kpis : undefined;
  const escopo = kpis.data?.escopo;
  const referencia = anterior ? rotuloJanela(anterior) : null;

  const canais = useMemo(
    () => [...new Set(serie.data?.serie.map((p) => p.canal) ?? [])].sort(),
    [serie.data],
  );
  const periodos = useMemo(
    () => [...new Set(serie.data?.serie.map((p) => p.periodo) ?? [])].sort(),
    [serie.data],
  );

  /** "S1", "S2"... na agregacao semanal; a data nas demais. */
  const rotulos = useMemo(
    () => rotulosDoPeriodo(periodos, granularidade),
    [periodos, granularidade],
  );

  /** Margem total por periodo, somando os canais — a linha da sparkline. */
  const tendencia = useMemo(
    () =>
      periodos.map((p) =>
        (serie.data?.serie ?? [])
          .filter((x) => x.periodo === p)
          .reduce((soma, x) => soma + numeroBruto(x.margem), 0),
      ),
    [periodos, serie.data],
  );

  // useOpcaoGrafico injeta o tema resolvido nas dependencias: baseDoTema() e
  // corDaSerie() leem as variaveis CSS via getComputedStyle no momento do
  // calculo, entao sem isso o grafico mantem as cores do tema anterior.
  // useOpcaoGrafico injeta o tema resolvido nas dependencias: baseDoTema() e
  // corDaSerie() leem as variaveis CSS via getComputedStyle no momento do
  // calculo, entao sem isso o grafico mantem as cores do tema anterior.
  const opcao = useOpcaoGrafico<EChartsOption>(
    () =>
      opcaoEvolucao({
        canais,
        periodos,
        rotulos,
        serie: serie.data?.serie ?? [],
        metrica,
        granularidade,
        janela,
      }),
    [canais, periodos, rotulos, serie.data, metrica, granularidade, janela],
  );

  const porArmazem = useMemo(
    () => totaisPorArmazem(armazens.data?.armazens ?? []),
    [armazens.data],
  );

  const opcaoArmazem = useOpcaoGrafico<EChartsOption>(
    () => opcaoArmazens(porArmazem),
    [porArmazem],
  );

  const extremos = useMemo(
    () => extremosDeSku(melhores.data?.itens ?? [], piores.data?.itens ?? []),
    [melhores.data, piores.data],
  );

  const opcaoSkus = useOpcaoGrafico<EChartsOption>(
    () => opcaoDeSkus(extremos),
    [extremos],
  );

  function mudarFiltros(f: Filtros) {
    setOffsetTabela(0);
    setFiltros(f);
  }

  const irParaSku = useCallback(
    ({ nome }: { nome: string }) =>
      navegar(`/skus/${encodeURIComponent(nome)}${consulta ? `?${consulta}` : ""}`),
    [navegar, consulta],
  );
  const irParaArmazens = useCallback(
    () => navegar(`/armazens${consulta ? `?${consulta}` : ""}`),
    [navegar, consulta],
  );

  // Detalhar e estreitar o recorte da pagina inteira, e nao so o grafico: os
  // KPIs, a cascata e os rankings passam a falar da mesma semana que o usuario
  // clicou. A agregacao desce sozinha porque a janela encolheu.
  const detalharPeriodo = useCallback(
    ({ indice }: { indice: number }) => {
      const inicio = periodos[indice];
      if (!inicio) return;
      const fatia = fatiaDoPeriodo(inicio, granularidade, janela);
      setPilhaZoom((pilha) => [...pilha, janela]);
      setOffsetTabela(0);
      setFiltros({ ...filtros, data_inicio: fatia.inicio, data_fim: fatia.fim });
    },
    [periodos, granularidade, janela, filtros, setFiltros],
  );

  const voltarPeriodo = useCallback(() => {
    const anterior = pilhaZoom[pilhaZoom.length - 1];
    setPilhaZoom((pilha) => pilha.slice(0, -1));
    setOffsetTabela(0);
    setFiltros({
      ...filtros,
      data_inicio: anterior?.inicio,
      data_fim: anterior?.fim,
    });
  }, [pilhaZoom, filtros, setFiltros]);

  const colunas = useMemo(
    () => colunasDaSerie({ granularidade, periodos, rotulos, canais }),
    [canais, granularidade, periodos, rotulos],
  );

  const resumoCarteira = carteira.data?.resumo;
  const rotuloDoRecorte = rotuloJanela(filtros);

  return (
    <>
      <CabecalhoPagina
        titulo="Visão geral"
        descricao="Margem bruta = receita − (quantidade × custo unitário). O custo vem congelado na nota (D2_CUSTO1)."
        contexto={
          <>
            <Badge tom="info">{rotuloDoRecorte ?? "Todo o período carregado"}</Badge>
            {escopo && <Badge>{escopo.rotulo}</Badge>}
          </>
        }
      />

      {escopo && <AvisoMarketplace texto={escopo.aviso_marketplace} />}

      <BarraFiltros valor={filtros} aoMudar={mudarFiltros} />

      <PainelKpis
        kpis={kpis}
        k={k}
        kAnterior={kAnterior}
        referencia={referencia}
        tendencia={tendencia}
        consulta={consulta}
        irParaArmazens={irParaArmazens}
      />

      {/* `Secao` e um Card sem margem propria: o espacamento entre os blocos
          empilhados e desta pilha, e nao de cada cartao. */}
      <div className="flex flex-col gap-4">
        {k && <FormacaoDaMargem k={k} />}

        <EvolucaoNoTempo
          serie={serie}
          colunas={colunas}
          opcao={opcao}
          granularidade={granularidade}
          metrica={metrica}
          setMetrica={setMetrica}
          modo={modo}
          setModo={setModo}
          offsetTabela={offsetTabela}
          setOffsetTabela={setOffsetTabela}
          itensPorPagina={itensPorPagina}
          setItensPorPagina={setItensPorPagina}
          pilhaZoom={pilhaZoom}
          detalharPeriodo={detalharPeriodo}
          voltarPeriodo={voltarPeriodo}
        />

        <PainelDimensoes
          consulta={consulta}
          armazens={armazens}
          porArmazem={porArmazem}
          opcaoArmazem={opcaoArmazem}
          irParaArmazens={irParaArmazens}
          melhores={melhores}
          piores={piores}
          extremos={extremos}
          opcaoSkus={opcaoSkus}
          irParaSku={irParaSku}
        />

        <CarteiraEmAberto carteira={carteira} resumoCarteira={resumoCarteira} />
      </div>
    </>
  );
}
