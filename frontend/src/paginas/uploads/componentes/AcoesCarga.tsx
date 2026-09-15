import { EyeIcon } from "lucide-react";

import { Button } from "@compartilhado/ui/atomos/button";

/** Acao da importacao: abre o detalhe direto. Com uma acao so, menu seria um
 *  clique a mais sem escolha nenhuma. */
export function AcoesCarga({ arquivo, aoVerDetalhes }: { arquivo: string; aoVerDetalhes: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={aoVerDetalhes}
      aria-label={`Ver detalhes da importação ${arquivo}`}
    >
      <EyeIcon data-icon="inline-start" />
      Ver
    </Button>
  );
}
