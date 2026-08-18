/** Usuarios.
 *
 *  Lista de quem acessa o BI. A tela e so a tabela e as acoes — o cadastro em si
 *  mora em `/usuarios/novo` e `/usuarios/:id` (pagina CadastroUsuario), porque
 *  formulario longo embutido na lista empurra a tabela para fora da tela.
 *
 *  As acoes rapidas (redefinir senha, remover) sao modais: resolvem-se em um
 *  campo e um clique, e tirar o admin da lista para isso o faria perder de vista
 *  exatamente a linha em que estava trabalhando.
 *
 *  Duas regras aparecem na tela porque o servidor as aplica de verdade:
 *
 *  - a conta protegida (o `admin` de emergencia) e listada, mas sem nenhuma acao;
 *  - o proprio usuario logado nao se remove.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ErroApi } from "../api/cliente";
import { useEu, useRedefinirSenha, useRemoverUsuario, useUsuarios } from "../api/hooks";
import type { Usuario } from "../api/tipos";
import { Erro, Vazio } from "../componentes/Layout";
import { AcoesModal, Modal } from "../componentes/Modal";
import { SeletorTema } from "../componentes/SeletorTema";
import { SkeletonTabela } from "../componentes/Skeleton";

const ROTULO_PERFIL: Record<string, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  vendedor: "Vendedor",
};

function mensagem(erro: unknown, padrao: string): string | null {
  if (!erro) return null;
  return erro instanceof ErroApi ? erro.message : padrao;
}

function data(iso: string | null): string {
  if (!iso) return "nunca acessou";
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Redefinicao de senha pelo administrador.
 *
 *  Nao pede a senha atual: o caso de uso e o de quem a esqueceu. A senha fica
 *  visivel enquanto e digitada — quem redefine precisa conseguir ditar o que
 *  acabou de definir, e mascarar aqui so produziria erro de digitacao. */
function ModalSenha({ usuario, aoFechar }: { usuario: Usuario; aoFechar: () => void }) {
  const [senha, setSenha] = useState("");
  const troca = useRedefinirSenha();
  const erro = mensagem(troca.error, "Falha inesperada ao redefinir a senha.");

  return (
    <Modal titulo={`Redefinir a senha de ${usuario.username}`} aoFechar={aoFechar}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          troca.mutate({ id: usuario.id, senha });
        }}
      >
        <div className="campo">
          <label htmlFor="nova-senha">Nova senha</label>
          <input
            id="nova-senha"
            type="text"
            value={senha}
            required
            autoFocus
            autoComplete="new-password"
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>

        <p>
          A senha atual não é solicitada. Comunique a nova senha à pessoa: nada é
          enviado por e-mail.
        </p>

        {troca.data ? (
          <p role="status" style={{ color: "var(--status-good)" }}>
            {troca.data.detail}
          </p>
        ) : null}
        {erro && <Erro mensagem={erro} />}

        <AcoesModal>
          <button className="botao" type="submit" disabled={troca.isPending}>
            {troca.isPending ? "Redefinindo…" : "Redefinir"}
          </button>
          <button className="botao-alt" type="button" onClick={aoFechar}>
            {troca.data ? "Fechar" : "Cancelar"}
          </button>
        </AcoesModal>
      </form>
    </Modal>
  );
}

/** Remocao. Confirmar em modal, e nao no `confirm()` do navegador: aqui da para
 *  dizer o que a remocao leva junto e mostrar o erro no mesmo lugar. */
function ModalRemocao({ usuario, aoFechar }: { usuario: Usuario; aoFechar: () => void }) {
  const remover = useRemoverUsuario();
  const erro = mensagem(remover.error, "Falha inesperada ao remover o usuário.");

  return (
    <Modal titulo={`Remover ${usuario.username}?`} aoFechar={aoFechar}>
      <p>
        A conta deixa de existir e a pessoa perde o acesso imediatamente.
        {usuario.vendedor
          ? ` O código de vendedor ${usuario.vendedor.codigo} fica livre para outro usuário.`
          : ""}
      </p>
      <p>
        Se a saída for temporária, prefira <strong>editar e marcar como inativo</strong>:
        preserva o cadastro e o histórico de acesso.
      </p>

      {erro && <Erro mensagem={erro} />}

      <AcoesModal>
        <button
          className="botao"
          type="button"
          disabled={remover.isPending}
          onClick={() => remover.mutate(usuario.id, { onSuccess: aoFechar })}
        >
          {remover.isPending ? "Removendo…" : "Remover"}
        </button>
        <button className="botao-alt" type="button" onClick={aoFechar}>
          Cancelar
        </button>
      </AcoesModal>
    </Modal>
  );
}

export function Usuarios() {
  const navegar = useNavigate();
  const { data: dados, isPending, error } = useUsuarios();
  const { data: eu } = useEu();

  const [senhaDe, setSenhaDe] = useState<number | null>(null);
  const [removendo, setRemovendo] = useState<number | null>(null);

  const alvo = (id: number | null) =>
    id === null ? undefined : dados?.usuarios.find((u) => u.id === id);

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Usuários</h1>
          <p style={{ color: "var(--text-secondary)", maxWidth: 640 }}>
            Quem pode entrar no BI e o que cada um enxerga. Administrador e gerente
            veem tudo; o perfil vendedor vê apenas as próprias linhas, e por isso
            precisa estar vinculado a um código do Protheus.
          </p>
        </div>
        <SeletorTema />
      </div>

      <button
        className="botao"
        style={{ marginBottom: 16 }}
        onClick={() => navegar("/usuarios/novo")}
      >
        Novo usuário
      </button>

      {error && <Erro mensagem="Não foi possível carregar os usuários." />}

      {isPending ? (
        <SkeletonTabela linhas={5} colunas={7} />
      ) : !dados?.usuarios.length ? (
        <Vazio mensagem="Nenhum usuário cadastrado." />
      ) : (
        <div className="cartao rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Login</th>
                <th>Nome</th>
                <th>Perfil</th>
                <th>Vendedor</th>
                <th>Situação</th>
                <th>Último acesso</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {dados.usuarios.map((u) => {
                const souEu = u.username === eu?.username;
                return (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.nome || "—"}</td>
                    <td>{ROTULO_PERFIL[u.perfil] ?? "sem perfil"}</td>
                    <td>
                      {u.vendedor ? `${u.vendedor.codigo} — ${u.vendedor.nome}` : "—"}
                    </td>
                    <td className={u.ativo ? undefined : "negativo"}>
                      {u.ativo ? "Ativo" : "Inativo"}
                    </td>
                    <td>{data(u.ultimo_acesso)}</td>
                    <td>
                      {u.protegido ? (
                        // A conta de emergencia nao tem acao nenhuma: se as
                        // permissoes forem erradas em qualquer outro lugar, e por
                        // ela que se volta a entrar.
                        <span
                          style={{ color: "var(--text-muted)" }}
                          title="Conta administrativa de emergência: só muda por acesso direto ao banco."
                        >
                          conta protegida
                        </span>
                      ) : (
                        <span style={{ display: "flex", gap: 6 }}>
                          <button
                            className="botao-alt"
                            onClick={() => navegar(`/usuarios/${u.id}`)}
                          >
                            Editar
                          </button>
                          <button className="botao-alt" onClick={() => setSenhaDe(u.id)}>
                            Senha
                          </button>
                          <button
                            className="botao-alt"
                            disabled={souEu}
                            title={
                              souEu ? "Você não pode remover a própria conta." : undefined
                            }
                            onClick={() => setRemovendo(u.id)}
                          >
                            Remover
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {alvo(senhaDe) && (
        <ModalSenha usuario={alvo(senhaDe)!} aoFechar={() => setSenhaDe(null)} />
      )}
      {alvo(removendo) && (
        <ModalRemocao usuario={alvo(removendo)!} aoFechar={() => setRemovendo(null)} />
      )}
    </>
  );
}
