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

import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { ErroApi } from "../api/cliente";
import { useEu, useRedefinirSenha, useRemoverUsuario, useUsuarios } from "../api/hooks";
import type { Usuario } from "../api/tipos";
import { Alert, AlertDescription } from "@/componentes/ui/alert";
import { Button } from "@/componentes/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/componentes/ui/field";
import { Input } from "@/componentes/ui/input";
import { Erro, Vazio } from "../componentes/Layout";
import { AcoesModal, Modal } from "../componentes/Modal";
import { SkeletonTabela } from "../componentes/Skeleton";
import { Tabela, type Coluna } from "../componentes/Tabela";
import { CabecalhoPagina, Secao } from "../componentes/Visual";

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
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="nova-senha">Nova senha</FieldLabel>
            <Input
              id="nova-senha"
              type="text"
              value={senha}
              required
              autoFocus
              autoComplete="new-password"
              onChange={(e) => setSenha(e.target.value)}
            />
            <FieldDescription>
              A senha atual não é solicitada. Comunique a nova senha à pessoa: nada é
              enviado por e-mail.
            </FieldDescription>
          </Field>

          {troca.data ? (
            <Alert role="status">
              <AlertDescription>{troca.data.detail}</AlertDescription>
            </Alert>
          ) : null}
          {erro && <Erro mensagem={erro} />}
        </FieldGroup>

        <AcoesModal>
          <Button type="submit" disabled={troca.isPending}>
            {troca.isPending ? "Redefinindo…" : "Redefinir"}
          </Button>
          <Button variant="outline" type="button" onClick={aoFechar}>
            {troca.data ? "Fechar" : "Cancelar"}
          </Button>
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
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>
          A conta deixa de existir e a pessoa perde o acesso imediatamente.
          {usuario.vendedor
            ? ` O código de vendedor ${usuario.vendedor.codigo} fica livre para outro usuário.`
            : ""}
        </p>
        <p>
          Se a saída for temporária, prefira{" "}
          <strong className="text-foreground">editar e marcar como inativo</strong>:
          preserva o cadastro e o histórico de acesso.
        </p>
      </div>

      {erro && <Erro mensagem={erro} />}

      <AcoesModal>
        <Button
          variant="destructive"
          type="button"
          disabled={remover.isPending}
          onClick={() => remover.mutate(usuario.id, { onSuccess: aoFechar })}
        >
          {remover.isPending ? "Removendo…" : "Remover"}
        </Button>
        <Button variant="outline" type="button" onClick={aoFechar}>
          Cancelar
        </Button>
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

  const colunas: readonly Coluna<Usuario>[] = useMemo(
    () => [
      { chave: null, rotulo: "Login", fixa: true, celula: (u) => u.username },
      { chave: null, rotulo: "Nome", celula: (u) => u.nome || "—" },
      { chave: null, rotulo: "Perfil", celula: (u) => ROTULO_PERFIL[u.perfil] ?? "sem perfil" },
      {
        chave: null,
        rotulo: "Vendedor",
        celula: (u) => (u.vendedor ? `${u.vendedor.codigo} — ${u.vendedor.nome}` : "—"),
      },
      {
        chave: null,
        rotulo: "Situação",
        negativo: (u) => !u.ativo,
        celula: (u) => (u.ativo ? "Ativo" : "Inativo"),
      },
      { chave: null, rotulo: "Último acesso", celula: (u) => data(u.ultimo_acesso) },
      {
        chave: null,
        rotulo: "Ações",
        acao: true,
        celula: (u) =>
          u.protegido ? (
            // A conta de emergencia nao tem acao nenhuma: se as permissoes forem
            // erradas em qualquer outro lugar, e por ela que se volta a entrar.
            <span
              className="text-xs text-muted-foreground"
              title="Conta administrativa de emergência: só muda por acesso direto ao banco."
            >
              conta protegida
            </span>
          ) : (
            <span className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => navegar(`/usuarios/${u.id}`)}>
                Editar
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSenhaDe(u.id)}>
                Senha
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={u.username === eu?.username}
                title={
                  u.username === eu?.username
                    ? "Você não pode remover a própria conta."
                    : undefined
                }
                onClick={() => setRemovendo(u.id)}
              >
                Remover
              </Button>
            </span>
          ),
      },
    ],
    [eu?.username, navegar],
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Usuários"
        descricao="Quem pode entrar no BI e o que cada um enxerga. Administrador e gerente veem tudo; o perfil vendedor vê apenas as próprias linhas, e por isso precisa estar vinculado a um código do Protheus."
      />

      <Button className="mb-4" onClick={() => navegar("/usuarios/novo")}>
        <PlusIcon data-icon="inline-start" />
        Novo usuário
      </Button>

      {error && <Erro mensagem="Não foi possível carregar os usuários." />}

      {isPending ? (
        <SkeletonTabela linhas={5} colunas={7} />
      ) : !dados?.usuarios.length ? (
        <Vazio mensagem="Nenhum usuário cadastrado." />
      ) : (
        <Secao titulo="Contas cadastradas">
          <Tabela
            linhas={dados.usuarios}
            colunas={colunas}
            chaveLinha={(u) => String(u.id)}
            rotuloAcessivel="Usuários do BI"
          />
        </Secao>
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
