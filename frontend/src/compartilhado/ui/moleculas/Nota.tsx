import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription } from "@compartilhado/ui/atomos/alert";

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
