
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
