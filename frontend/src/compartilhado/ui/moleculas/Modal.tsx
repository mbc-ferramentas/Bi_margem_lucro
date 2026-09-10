/** Modal para acoes rapidas.
 *
 *  Serve ao que se resolve em um clique e uma confirmacao — redefinir senha,
 *  remover um registro. Cadastro nao entra aqui: formulario com varios campos
 *  vira pagina propria, porque perder o preenchimento ao clicar fora e o tipo de
 *  erro que o modal convida a cometer.
 *
 *  Era um `<dialog>` nativo. O Dialog do Base UI entrega o mesmo foco preso,
 *  fundo inerte e Esc, e resolve um problema que o nativo tinha aqui: o
 *  `aria-labelledby` apontava para um id fixo, e a tela de Usuarios monta dois
 *  modais no mesmo documento — dois elementos com o mesmo id.
 */

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@compartilhado/ui/atomos/dialog";

export function Modal({
  titulo,
  aoFechar,
  children,
}: {
  titulo: string;
  aoFechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) aoFechar();
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Rodape padrao: a acao principal a esquerda, cancelar ao lado. */
export function AcoesModal({ children }: { children: React.ReactNode }) {
  return <DialogFooter className="sm:justify-start">{children}</DialogFooter>;
}
