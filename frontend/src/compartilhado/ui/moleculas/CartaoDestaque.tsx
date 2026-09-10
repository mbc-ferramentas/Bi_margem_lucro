import { cn } from "@compartilhado/lib/utils";
import { Card, CardContent } from "@compartilhado/ui/atomos/card";
import { FAIXA_TOM, LAVAGEM_TOM, type Tom } from "@compartilhado/ui/tom";

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
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0", LAVAGEM_TOM[tom])}
      />
      <CardContent className="flex h-full min-w-0 flex-col py-(--card-spacing)">
        {/* O ponto laranja e o unico traco de marca do cartao: marca a tela
            como nossa sem entrar na leitura do numero. */}
        <span className="flex items-center gap-2 text-[11px] leading-4 font-medium tracking-wider text-muted-foreground uppercase">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-marca-acento" />
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
        {/* A sparkline sangra ate as bordas do cartao: margem negativa do
            proprio `--card-spacing`, entao ela acompanha qualquer mudanca de
            respiro sem numero magico. */}
        {rodape && (
          <div className="mt-auto -mb-(--card-spacing) pt-4 [&>*]:-mx-(--card-spacing)">{rodape}</div>
        )}
      </CardContent>
    </Card>
  );
}
