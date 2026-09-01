/** Kit visual do BI.
 *
 *  As assinaturas exportadas aqui sao contrato com as 13 paginas: mudar o nome
 *  de um `tom` ou de uma prop obriga a varrer todas elas. O interior e livre.
 */

import { InfoIcon, XIcon } from "lucide-react";

import type { Filtros } from "../api/tipos";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/componentes/ui/alert";
import { Badge as BadgeUi } from "@/componentes/ui/badge";
import { Button } from "@/componentes/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/componentes/ui/card";
import { Progress, ProgressTrack, ProgressIndicator } from "@/componentes/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/componentes/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/componentes/ui/toggle-group";
import { SeletorTema } from "./SeletorTema";

const ROTULOS_FILTRO: Partial<Record<keyof Filtros, string>> = {
  competencia_inicio: "De",
  competencia_fim: "Até",
  canal: "Canal",
  armazem: "Armazém",
  vendedor: "Vendedor",
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
          <span className="max-w-40 truncate">{Array.isArray(item) ? item.join(", ") : item}</span>
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
}: {
  rotulo: string;
  valor: string;
  apoio?: string;
  tom?: Tom;
  aoClicar?: () => void;
}) {
  const conteudo = (
    <>
      {/* Faixa de tom: e o unico lugar em que a cor de status aparece sem
          icone. Ela reforca o numero que esta a dois centimetros dali, nunca o
          substitui — por isso e um adorno de borda, e nao o fundo do cartao. */}
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-[3px]", FAIXA_TOM[tom])} />
      <CardContent className="flex min-h-28 flex-col items-start gap-2 text-left">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {rotulo}
        </span>
        {/* Figura proporcional de proposito: numero solto nao alinha com nada.
            O tabular fica para as colunas de tabela e para os eixos. */}
        <strong className="text-[clamp(1.3rem,2vw,1.75rem)] leading-none font-semibold tracking-tight">
          {valor}
        </strong>
        {apoio && <span className="mt-auto text-xs text-muted-foreground">{apoio}</span>}
      </CardContent>
    </>
  );

  const classe = "relative overflow-hidden py-0";

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

/** Grade dos KPIs do topo. Quatro colunas na tela cheia, duas no tablet, uma no
 *  celular — um KPI espremido a um terco de largura corta o numero, que e a
 *  unica coisa que ele tem para dizer. */
export function GradeKpis({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
}: {
  valor: T;
  opcoes: readonly (readonly [T, string])[];
  aoMudar: (valor: T) => void;
  rotulo: string;
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
        <ToggleGroupItem key={chave} value={chave}>
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
