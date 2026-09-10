/** Kit visual do BI.
 *
 *  As assinaturas exportadas aqui sao contrato com as 13 paginas: mudar o nome
 *  de um `tom` ou de uma prop obriga a varrer todas elas. O interior e livre.
 */

import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon, InfoIcon, XIcon } from "lucide-react";

import type { Filtros } from "../api/tipos";
import { dataLonga } from "@compartilhado/lib/formato";
import { cn } from "@compartilhado/lib/utils";
import { Alert, AlertDescription } from "@compartilhado/ui/atomos/alert";
import { Badge as BadgeUi } from "@compartilhado/ui/atomos/badge";
import { Button } from "@compartilhado/ui/atomos/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@compartilhado/ui/atomos/card";
import { Progress, ProgressTrack, ProgressIndicator } from "@compartilhado/ui/atomos/progress";
import { Tabs, TabsList, TabsTrigger } from "@compartilhado/ui/atomos/tabs";
import { ToggleGroup, ToggleGroupItem } from "@compartilhado/ui/atomos/toggle-group";
import { SeletorTema } from "./SeletorTema";

const ROTULOS_FILTRO: Partial<Record<keyof Filtros, string>> = {
  data_inicio: "De",
  data_fim: "Até",
  canal: "Canal",
  armazem: "Armazém",
  vendedor: "Vendedores",
  grupo: "Grupos",
  situacao: "Situação",
  busca: "Busca",
};

export type Tom = "neutro" | "bom" | "atencao" | "critico";

/** As cores de status sao reservadas: nunca viram "serie 6". E como no modo
 *  claro atencao e serio ficam abaixo de 3:1 por construcao, elas sempre andam
 *  acompanhadas do rotulo do KPI — nunca sozinhas. */
const FAIXA_TOM: Record<Tom, string> = {
  neutro: "bg-axis",
  bom: "bg-status-bom",
  atencao: "bg-status-atencao",
  critico: "bg-status-critico",
};

/** O valor do chip como o usuario escreveu na tela: a data vai em ISO para a API,
 *  mas ninguem le "2026-07-01" como 1o de julho. */
function textoDoChip(chave: keyof Filtros, item: string | string[]): string {
  if (Array.isArray(item)) return item.join(", ");
  return chave === "data_inicio" || chave === "data_fim" ? dataLonga(item) : item;
}

export function ChipsFiltros({ valor, aoMudar }: { valor: Filtros; aoMudar: (filtros: Filtros) => void }) {
  const ativos = Object.entries(valor).filter(([, item]) =>
    Array.isArray(item) ? item.length > 0 : Boolean(item),
  ) as [keyof Filtros, string | string[]][];
  if (!ativos.length) return null;

  function remover(chave: keyof Filtros) {
    const seguintes = { ...valor };
    delete seguintes[chave];
    // Trocar de armazem invalida o grupo escolhido: o recorte novo pode nao
    // conter nenhum, e a tela ficaria vazia sem explicar por que.
    if (chave === "armazem") seguintes.grupo = [];
    aoMudar(seguintes);
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
      aria-label={`${ativos.length} filtros ativos`}
    >
      <span>Filtros ativos</span>
      {ativos.map(([chave, item]) => (
        <BadgeUi
          key={chave}
          variant="outline"
          render={
            <button type="button" onClick={() => remover(chave)} aria-label={`Remover filtro ${ROTULOS_FILTRO[chave] ?? chave}`} />
          }
          className="cursor-pointer gap-1 hover:border-ring"
        >
          <span className="font-semibold text-foreground">{ROTULOS_FILTRO[chave] ?? chave}:</span>
          <span className="max-w-40 truncate">{textoDoChip(chave, item)}</span>
          <XIcon aria-hidden="true" />
        </BadgeUi>
      ))}
      <Button type="button" variant="link" size="sm" onClick={() => aoMudar({})}>
        Limpar tudo
      </Button>
    </div>
  );
}

export function CabecalhoPagina({
  titulo,
  descricao,
  voltar,
  contexto,
}: {
  titulo: string;
  descricao: string;
  voltar?: React.ReactNode;
  contexto?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {voltar}
        <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{descricao}</p>
        {contexto && <div className="mt-2.5 flex flex-wrap gap-1.5">{contexto}</div>}
      </div>
      <SeletorTema />
    </div>
  );
}

export function CartaoKpi({
  rotulo,
  valor,
  apoio,
  tom = "neutro",
  aoClicar,
  delta,
}: {
  rotulo: string;
  valor: string;
  apoio?: string;
  tom?: Tom;
  aoClicar?: () => void;
  /** Variacao contra o periodo anterior. Fica abaixo do apoio e e opcional de
   *  proposito: nem todo recorte tem periodo anterior conhecido, e um cartao
   *  sem base de comparacao nao inventa uma. */
  delta?: React.ReactNode;
}) {
  const conteudo = (
    <>
      {/* Faixa de tom: e o unico lugar em que a cor de status aparece sem
          icone. Ela reforca o numero que esta a dois centimetros dali, nunca o
          substitui — por isso e um adorno de borda, e nao o fundo do cartao. */}
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-[3px]", FAIXA_TOM[tom])} />
      {/* Ritmo vertical fixo: cada faixa tem altura propria e nao depende de
          quebra de linha do vizinho. Antes a legenda era empurrada com
          `mt-auto` e o espaco entre valor e legenda mudava de cartao para
          cartao sempre que um apoio quebrava em duas linhas e esticava a
          linha inteira da grade. */}
      <CardContent className="flex w-full min-w-0 flex-1 flex-col items-start py-4 text-left">
        <span className="line-clamp-1 h-4 w-full text-[11px] leading-4 font-medium tracking-wider text-muted-foreground uppercase">
          {rotulo}
        </span>
        {/* Figura proporcional de proposito: numero solto nao alinha com nada.
            O tabular fica para as colunas de tabela e para os eixos.

            O tamanho e escalonado por breakpoint, e nao por `vw`: a largura do
            cartao vem da grade, nao da janela, e um `clamp` em `vw` fazia o
            numero crescer ate vazar de um cartao estreito numa tela larga —
            exatamente onde a grade tem mais colunas e menos espaco por coluna. */}
        <strong className="mt-2 block h-7 w-full truncate text-xl leading-7 font-semibold tracking-tight sm:text-2xl">
          {valor}
        </strong>
        {/* Duas linhas reservadas: o apoio mais longo quebra, o mais curto
            deixa a folga — em ambos os casos a distancia ate o valor e a
            mesma em todos os cartoes. */}
        {apoio && (
          <span className="mt-1.5 line-clamp-2 min-h-8 w-full text-xs leading-4 text-muted-foreground">
            {apoio}
          </span>
        )}
        {/* Altura reservada mesmo sem variacao: senao um cartao com base de
            comparacao e outro sem ficam de alturas diferentes na mesma linha. */}
        {delta !== undefined && <span className="mt-1 flex h-4 w-full items-center">{delta}</span>}
      </CardContent>
    </>
  );

  // py-0 porque o padding vertical vive no CardContent — o cartao clicavel e
  // um <button>, e nao herda o padding do Card. O min-h iguala o cartao sem
  // apoio ao que tem duas linhas de legenda, e cresce quando ha uma linha de
  // variacao a mais para caber.
  const classe = cn(
    "relative overflow-hidden py-0",
    delta === undefined ? "min-h-[7.5rem]" : "min-h-[9rem]",
  );

  if (!aoClicar) return <Card className={classe}>{conteudo}</Card>;

  return (
    <button
      type="button"
      onClick={aoClicar}
      className={cn(
        classe,
        "flex w-full flex-col rounded-xl border bg-card text-card-foreground shadow-sm transition-colors",
        "cursor-pointer hover:border-ring focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
      )}
    >
      {conteudo}
    </button>
  );
}

/** Variacao contra o periodo anterior.
 *
 *  Tres decisoes que nao sao estilo:
 *
 *  1. **Seta + sinal + texto.** A cor nunca carrega o significado sozinha — em
 *     modo claro o verde de status fica abaixo de 3:1 sobre o cartao, e ha quem
 *     nao distinga verde de vermelho em nenhum contraste.
 *  2. **Ponto percentual para taxa, percentual para valor.** Margem que sobe de
 *     24% para 26% subiu 2 p.p., nao 2%; trocar as duas unidades e o jeito mais
 *     comum de um painel mentir.
 *  3. **`inverter` para custo e desconto.** Subir e ruim la, e pintar de verde
 *     um custo que cresceu seria pior do que nao pintar nada.
 *
 *  Base zerada nao vira variacao infinita: sem denominador, so o texto do
 *  periodo aparece. */
export function Delta({
  atual,
  anterior,
  formato = "percentual",
  inverter = false,
  referencia,
}: {
  atual: number | null;
  anterior: number | null;
  formato?: "percentual" | "pontos";
  inverter?: boolean;
  /** Rotulo da janela comparada, ex.: "03/2026 a 06/2026". */
  referencia?: string | null;
}) {
  if (atual === null || anterior === null || !Number.isFinite(atual) || !Number.isFinite(anterior)) {
    return null;
  }

  const bruto = formato === "pontos" ? (atual - anterior) * 100 : anterior === 0 ? null : (atual - anterior) / Math.abs(anterior);
  if (bruto === null || !Number.isFinite(bruto)) return null;

  // Meio ponto percentual de variacao em um faturamento de milhoes e ruido de
  // arredondamento, nao noticia: abaixo disso a leitura e "estavel".
  const estavel = Math.abs(bruto) < (formato === "pontos" ? 0.05 : 0.001);
  const melhorou = inverter ? bruto < 0 : bruto > 0;
  const Icone = estavel ? ArrowRightIcon : bruto > 0 ? ArrowUpRightIcon : ArrowDownRightIcon;

  const sinal = bruto > 0 ? "+" : "";
  const texto =
    formato === "pontos"
      ? `${sinal}${bruto.toFixed(1).replace(".", ",")} p.p.`
      : `${sinal}${(bruto * 100).toFixed(1).replace(".", ",")}%`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs leading-4",
        estavel ? "text-muted-foreground" : melhorou ? "text-delta-bom" : "text-destructive",
      )}
    >
      <Icone className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {estavel ? "estável" : texto}
        {referencia && <span className="text-muted-foreground"> vs {referencia}</span>}
      </span>
    </span>
  );
}

/** O numero que a tela lidera.
 *
 *  Um cartao, e nao mais um item da grade de KPIs: se todos os numeros tem o
 *  mesmo tamanho, nenhum e a resposta. Figura proporcional (nunca
 *  `num-tabular`) porque um numero solto e grande nao alinha com nada — o
 *  tabular fica para as colunas de tabela e para os eixos. */
export function CartaoDestaque({
  rotulo,
  valor,
  secundario,
  apoio,
  delta,
  tom = "neutro",
  rodape,
}: {
  rotulo: string;
  valor: string;
  secundario?: string;
  apoio?: string;
  delta?: React.ReactNode;
  tom?: Tom;
  /** Espaco livre no pe do cartao — e onde entra a sparkline. */
  rodape?: React.ReactNode;
}) {
  return (
    // `--card-spacing` maior: o cartao de destaque respira mais que os KPIs
    // porque e ele que a tela le primeiro. Mexer na variavel, e nao em `p-*`
    // solto, mantem os quatro lados iguais — foi o descompasso entre o padding
    // horizontal herdado e o vertical escrito a mao que deixava a margem torta.
    <Card className="relative overflow-hidden py-0 [--card-spacing:--spacing(5)]">
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-[3px]", FAIXA_TOM[tom])} />
      <CardContent className="flex h-full min-w-0 flex-col py-(--card-spacing)">
        <span className="text-[11px] leading-4 font-medium tracking-wider text-muted-foreground uppercase">
          {rotulo}
        </span>
        <div className="mt-2.5 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          {/* Escalonado por breakpoint e nao por `vw`: a largura vem da coluna
              da grade, e um `clamp` em `vw` estourava a caixa justamente na
              tela larga, onde esta coluna e proporcionalmente mais estreita. */}
          <strong className="min-w-0 truncate py-0.5 text-[1.75rem] leading-[1.1] font-semibold tracking-tight sm:text-[2rem] xl:text-[2.25rem]">
            {valor}
          </strong>
          {secundario && (
            <span className="text-lg leading-none font-medium text-muted-foreground">
              {secundario}
            </span>
          )}
        </div>
        {delta && <div className="mt-2.5">{delta}</div>}
        {apoio && <p className="mt-2 text-xs leading-4 text-muted-foreground">{apoio}</p>}
        {rodape && <div className="mt-auto pt-4">{rodape}</div>}
      </CardContent>
    </Card>
  );
}

/** Uma conta escrita como conta: parcela, operador, parcela, resultado.
 *
 *  Existe porque a formacao da margem tem tres subtracoes que o Protheus
 *  registra em lugares diferentes, e quatro cartoes soltos lado a lado nao
 *  dizem que um deriva do outro. No celular os operadores giram 90 graus e a
 *  conta desce em coluna, continuando legivel como sequencia. */
export function Cascata({
  parcelas,
}: {
  parcelas: readonly { rotulo: string; valor: string; operador?: string }[];
}) {
  return (
    <div className="grid items-center gap-2 max-md:justify-items-stretch md:flex md:flex-wrap md:gap-3">
      {parcelas.map((parcela, indice) => (
        <div key={parcela.rotulo} className="contents">
          {indice > 0 && (
            <span
              className="text-center text-xl text-muted-foreground max-md:h-4 max-md:rotate-90"
              aria-hidden="true"
            >
              {parcela.operador ?? "−"}
            </span>
          )}
          <div className="min-w-[130px] rounded-lg bg-muted p-3">
            <span className="block text-[10.5px] tracking-wide text-muted-foreground uppercase">
              {parcela.rotulo}
            </span>
            <strong className="num-tabular mt-1 block text-[17px]">{parcela.valor}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Abas<T extends string>({
  valor,
  opcoes,
  aoMudar,
  rotulo = "Seções da página",
}: {
  valor: T;
  opcoes: readonly { valor: T; rotulo: string; contador?: number }[];
  aoMudar: (valor: T) => void;
  rotulo?: string;
}) {
  return (
    <Tabs
      value={valor}
      onValueChange={(seguinte) => aoMudar(seguinte as T)}
      className="mb-4"
    >
      {/* activateOnFocus: o Base UI vem com ativacao manual (seta move o foco,
          Enter confirma). Aqui o conteudo da aba ja esta montado e a troca e
          barata, entao a seta troca direto — e o comportamento que as telas
          tinham antes do redesign. */}
      <TabsList
        variant="line"
        activateOnFocus
        aria-label={rotulo}
        className="border-b border-border"
      >
        {opcoes.map((opcao) => (
          <TabsTrigger key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
            {opcao.contador !== undefined && (
              <BadgeUi variant="secondary" className="ml-1.5">
                {opcao.contador}
              </BadgeUi>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

const VARIANTE_BADGE = {
  neutro: "secondary",
  info: "outline",
  bom: "outline",
  atencao: "outline",
  critico: "destructive",
} as const;

const COR_BADGE: Record<keyof typeof VARIANTE_BADGE, string> = {
  neutro: "",
  info: "border-primary/30 bg-primary/10 text-primary",
  bom: "border-status-bom/30 bg-status-bom/10 text-delta-bom",
  atencao: "border-status-atencao/40 bg-status-atencao/15 text-foreground",
  critico: "",
};

export function Badge({
  children,
  tom = "neutro",
}: {
  children: React.ReactNode;
  tom?: keyof typeof VARIANTE_BADGE;
}) {
  return (
    <BadgeUi variant={VARIANTE_BADGE[tom]} className={COR_BADGE[tom]}>
      {children}
    </BadgeUi>
  );
}

const BORDA_INSIGHT: Record<Tom, string> = {
  neutro: "border-l-axis",
  bom: "border-l-status-bom",
  atencao: "border-l-status-atencao",
  critico: "border-l-status-critico",
};

export function PainelInsight({
  titulo,
  valor,
  texto,
  tom = "neutro",
}: {
  titulo: string;
  valor?: string;
  texto: string;
  tom?: Tom;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-l-[3px] bg-card px-3.5 py-3 text-xs text-muted-foreground",
        BORDA_INSIGHT[tom],
      )}
    >
      <span className="text-[10.5px] tracking-wider text-muted-foreground uppercase">{titulo}</span>
      {valor && <strong className="text-base text-foreground">{valor}</strong>}
      <span>{texto}</span>
    </div>
  );
}

const TRILHO_COMPOSICAO: Record<"info" | Exclude<Tom, "neutro">, string> = {
  info: "bg-primary",
  bom: "bg-status-bom",
  atencao: "bg-status-atencao",
  critico: "bg-status-critico",
};

export function BarraComposicao({
  valor,
  rotulo,
  detalhe,
  tom = "critico",
}: {
  valor: number;
  rotulo: string;
  detalhe: string;
  tom?: "info" | Exclude<Tom, "neutro">;
}) {
  // Limitar aqui e nao no chamador: a fracao vem de uma divisao com o total no
  // denominador, e um total zerado devolve NaN ou Infinity.
  const limitado = Math.max(0, Math.min(1, Number.isFinite(valor) ? valor : 0));
  return (
    <div className="py-3.5">
      <div className="mb-2 flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{rotulo}</span>
        <strong className="text-foreground">{detalhe}</strong>
      </div>
      <Progress value={limitado * 100} aria-label={rotulo} className="block">
        <ProgressTrack className="h-2.5">
          <ProgressIndicator className={TRILHO_COMPOSICAO[tom]} />
        </ProgressTrack>
      </Progress>
    </div>
  );
}

/** Secao de conteudo: o cartao que agrupa um grafico ou uma tabela.
 *
 *  `acao` fica na mesma linha do titulo, e nao acima dele, porque em toda tela
 *  onde ela existe (o seletor de metrica do ranking, o alternador grafico/
 *  tabela) ela e um recorte do que a secao mostra — nao um comando da pagina. */
export function Secao({
  titulo,
  nota,
  acao,
  children,
}: {
  titulo: string;
  nota?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{titulo}</CardTitle>
        {nota && <CardDescription className="text-xs">{nota}</CardDescription>}
        {acao && <CardAction>{acao}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const COLUNAS_KPI = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 xl:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
} as const;

/** Grade dos KPIs do topo. Quatro colunas na tela cheia, duas no tablet, uma no
 *  celular — um KPI espremido a um terco de largura corta o numero, que e a
 *  unica coisa que ele tem para dizer.
 *
 *  `colunas` existe para os blocos que nao tem quatro cartoes: com o padrao,
 *  tres cartoes se espalhavam numa grade de quatro e o ultimo ficava orfao.
 *  `margem` sai do caminho quando a grade esta dentro de outra grade. */
export function GradeKpis({
  children,
  colunas = 4,
  margem = true,
}: {
  children: React.ReactNode;
  colunas?: keyof typeof COLUNAS_KPI;
  margem?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3",
        COLUNAS_KPI[colunas],
        margem && "mb-4",
      )}
    >
      {children}
    </div>
  );
}

export function GradeInsights({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3.5 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
      {children}
    </div>
  );
}

/** Alternador de uma escolha entre poucas — metrica de um ranking, modo de
 *  exibicao. Escolha unica: o grupo nunca fica vazio. */
export function Segmentado<T extends string>({
  valor,
  opcoes,
  aoMudar,
  rotulo,
  desabilitadas,
}: {
  valor: T;
  opcoes: readonly (readonly [T, string])[];
  aoMudar: (valor: T) => void;
  rotulo: string;
  /** Opcoes que existem mas nao cabem no estado atual — a granularidade diaria
   *  num recorte de um ano, por exemplo. Ficam apagadas em vez de sumir: a fila
   *  de botoes mudaria de tamanho a cada troca de periodo, e um botao que se move
   *  e mais confuso que um botao desabilitado. */
  desabilitadas?: readonly T[];
}) {
  return (
    <ToggleGroup
      value={[valor]}
      onValueChange={(seguinte) => {
        // Clicar no item ja marcado devolve lista vazia. Aqui isso nao e uma
        // opcao valida: sem metrica o grafico nao tem o que desenhar.
        const escolhido = (seguinte as T[])[0];
        if (escolhido) aoMudar(escolhido);
      }}
      variant="outline"
      size="sm"
      aria-label={rotulo}
    >
      {opcoes.map(([chave, texto]) => (
        <ToggleGroupItem
          key={chave}
          value={chave}
          disabled={desabilitadas?.includes(chave)}
        >
          {texto}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Nota explicativa dentro de uma secao.
 *
 *  Nao e alerta: nao ha nada de errado. Serve para o caso — recorrente neste BI
 *  — de dois numeros da mesma tela discordarem por um motivo legitimo, e a
 *  explicacao precisar ficar ao lado deles, nao no rodape. */
export function Nota({ children }: { children: React.ReactNode }) {
  return (
    <Alert role="note" className="mt-3">
      <InfoIcon />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
