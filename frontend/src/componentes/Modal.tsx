/** Modal para acoes rapidas.
 *
 *  Serve ao que se resolve em um clique e uma confirmacao — redefinir senha,
 *  remover um registro. Cadastro nao entra aqui: formulario com varios campos
 *  vira pagina propria, porque perder o preenchimento ao clicar fora e o tipo de
 *  erro que o modal convida a cometer.
 *
 *  Usa o `<dialog>` nativo em modo modal: o navegador ja cuida do foco preso, do
 *  fundo inerte e do Esc. Reimplementar isso na mao costuma deixar o leitor de
 *  tela navegando pela pagina que esta atras.
 */

import { useEffect, useRef } from "react";

export function Modal({
  titulo,
  aoFechar,
  children,
}: {
  titulo: string;
  aoFechar: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // `showModal` so pode ser chamado uma vez por abertura; o dialogo e montado
    // e desmontado junto com a acao, entao o efeito roda uma vez so.
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-titulo"
      // Esc dispara `cancel` antes de fechar: avisar o pai aqui mantem o estado
      // dele em sincronia com o que esta na tela.
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onClose={aoFechar}
      // Clique no fundo escuro (fora da caixa) fecha, como em qualquer modal.
      onClick={(e) => {
        if (e.target === ref.current) aoFechar();
      }}
    >
      <div className="modal-caixa">
        <div className="modal-topo">
          <h2 id="modal-titulo">{titulo}</h2>
          <button
            type="button"
            className="botao-alt"
            aria-label="Fechar"
            onClick={aoFechar}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Rodape padrao: a acao principal a esquerda, cancelar ao lado. */
export function AcoesModal({ children }: { children: React.ReactNode }) {
  return <div className="modal-acoes">{children}</div>;
}
