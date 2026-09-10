import { cn } from "@compartilhado/lib/utils";
import { Card, CardContent } from "@compartilhado/ui/atomos/card";
import { FAIXA_TOM, LAVAGEM_TOM, type Tom } from "@compartilhado/ui/tom";

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
      {/* Lavagem: puro acabamento, presa a mesma variavel de tom para nunca
          divergir da faixa. `inset-0` sob o conteudo, sem interceptar clique. */}
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0", LAVAGEM_TOM[tom])}
      />
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
    "relative overflow-hidden py-0 transition-[box-shadow,--tw-ring-color] duration-150",
    delta === undefined ? "min-h-[7.5rem]" : "min-h-[9rem]",
  );

  if (!aoClicar) return <Card className={classe}>{conteudo}</Card>;

  return (
    <button
      type="button"
      onClick={aoClicar}
      className={cn(
        classe,
        "flex w-full flex-col rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10",
        // Elevacao no hover em vez de troca de cor de borda: o cartao clicavel
        // se anuncia sem repintar a moldura, que e o que a faixa de tom usa.
        "cursor-pointer hover:ring-foreground/20 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
      )}
    >
      {conteudo}
    </button>
  );
}
