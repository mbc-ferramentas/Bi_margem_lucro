/** Os tres estados que quase toda tela precisa: erro, vazio e aviso de escopo.
 *
 *  Moravam no mesmo arquivo do shell da aplicacao, e por isso a `Tabela`
 *  dependia do `Layout` so para exibir "nada para mostrar". Aqui nao dependem
 *  de nada alem dos atomos. */

import { TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@compartilhado/ui/atomos/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@compartilhado/ui/atomos/empty";

/** Aviso de escopo. Obrigatorio em toda tela que exibe o canal Marketplace:
 *  a comissao de 12-19% ainda nao esta lancada, e sem o rotulo o numero engana. */
export function AvisoMarketplace({ texto }: { texto: string }) {
  return (
    <Alert role="note" className="mb-4 border-status-atencao/40 bg-status-atencao/10">
      <TriangleAlertIcon className="text-status-atencao" />
      <AlertTitle className="sr-only">Atenção</AlertTitle>
      <AlertDescription className="text-foreground">{texto}</AlertDescription>
    </Alert>
  );
}

export function Erro({ mensagem }: { mensagem: string }) {
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertTitle>Não foi possível carregar</AlertTitle>
      <AlertDescription>{mensagem}</AlertDescription>
    </Alert>
  );
}

export function Vazio({ mensagem }: { mensagem: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Nada para mostrar</EmptyTitle>
        <EmptyDescription>{mensagem}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
