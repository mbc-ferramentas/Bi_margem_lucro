import { CheckIcon, XIcon } from "lucide-react";

/** Icone + rotulo, nunca a cor sozinha: no modo claro o verde de sucesso fica
 *  abaixo de 3:1 contra o cartao. */
export function Situacao({ status }: { status: string }) {
  const sucesso = status === "sucesso";
  return (
    <span
      className={
        sucesso
          ? "flex items-center gap-1 text-delta-bom"
          : "flex items-center gap-1 text-destructive"
      }
    >
      {sucesso ? (
        <CheckIcon className="size-4" aria-hidden="true" />
      ) : (
        <XIcon className="size-4" aria-hidden="true" />
      )}
      {sucesso ? "Carregado" : "Erro"}
    </span>
  );
}
