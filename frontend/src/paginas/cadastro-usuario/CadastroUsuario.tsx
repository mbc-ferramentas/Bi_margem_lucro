/** Cadastro de usuario.
 *
 *  Pagina propria, e nao um formulario embutido na lista: sao seis campos com
 *  regras que dependem umas das outras (o perfil vendedor exige codigo, a senha
 *  so existe na criacao). Em um modal, um clique fora apagaria o preenchimento;
 *  na lista, o formulario empurraria a tabela para fora da tela.
 *
 *  A mesma pagina cria e edita — `/usuarios/novo` e `/usuarios/:id`. O que muda
 *  e o campo de senha: na edicao ele nao aparece, porque trocar senha e uma acao
 *  a parte (o botao "Senha" na lista). Assim, salvar um e-mail nunca derruba o
 *  acesso de alguem por engano.
 */

import { PERFIS, type Perfil } from "@compartilhado/config";
import { useSalvarUsuario, useUsuarios } from "@entidades/usuario";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { ErroApi } from "@compartilhado/api/cliente";
import { Button } from "@compartilhado/ui/atomos/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@compartilhado/ui/atomos/field";
import { Input } from "@compartilhado/ui/atomos/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@compartilhado/ui/atomos/select";
import { SkeletonTabela } from "@compartilhado/ui/moleculas/Skeleton";
import { Erro, Secao } from "@compartilhado/ui";
import { CabecalhoPagina } from "@widgets/cabecalho-pagina";

const ROTULO_PERFIL: Record<Perfil, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  vendedor: "Vendedor",
};

const DESCRICAO_PERFIL: Record<Perfil, string> = {
  admin: "Vê tudo, carrega os arquivos do Protheus e administra os usuários.",
  gerente: "Vê tudo, mas não carrega arquivos nem administra usuários.",
  vendedor: "Vê apenas as próprias linhas — exige o código do Protheus.",
};

type Form = {
  username: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  vendedor_codigo: string;
  senha: string;
};

const VAZIO: Form = {
  username: "",
  nome: "",
  email: "",
  perfil: "gerente",
  ativo: true,
  vendedor_codigo: "",
  senha: "",
};

export function CadastroUsuario() {
  const { id } = useParams();
  const navegar = useNavigate();
  const editando = id !== undefined;

  // A lista ja traz o usuario e os vendedores; reaproveita-la evita um endpoint
  // de detalhe so para preencher o formulario.
  const { data: dados, isPending, error } = useUsuarios();
  const salvar = useSalvarUsuario();

  const alvo = editando ? dados?.usuarios.find((u) => u.id === Number(id)) : undefined;
  const [form, setForm] = useState<Form | null>(null);

  if (isPending) return <Carregando />;
  if (error) return <Erro mensagem="Não foi possível carregar o cadastro." />;
  if (editando && !alvo) return <Erro mensagem="Usuário não encontrado." />;
  if (alvo?.protegido) {
    // O servidor tambem recusa; a mensagem aqui evita preencher a tela inteira
    // para receber um 403 no fim.
    return (
      <Erro mensagem="Esta é a conta administrativa protegida: ela só muda por acesso direto ao banco." />
    );
  }

  const inicial: Form = alvo
    ? {
        username: alvo.username,
        nome: alvo.nome,
        email: alvo.email,
        perfil: (alvo.perfil || "gerente") as Perfil,
        ativo: alvo.ativo,
        vendedor_codigo: alvo.vendedor?.codigo ?? "",
        senha: "",
      }
    : VAZIO;
  const valores = form ?? inicial;

  function campo<C extends keyof Form>(chave: C, valor: Form[C]) {
    setForm({ ...valores, [chave]: valor });
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const { senha, ...resto } = valores;
    salvar.mutate(
      { id: alvo?.id, ...resto, ...(editando ? {} : { senha }) },
      { onSuccess: () => navegar("/usuarios") },
    );
  }

  // Um codigo ja vinculado a outra pessoa seria recusado pela API; tira-lo da
  // lista evita descobrir isso so depois de preencher o formulario inteiro.
  const vendedores = (dados?.vendedores ?? []).filter(
    (v) => !v.usuario || v.codigo === inicial.vendedor_codigo,
  );

  const erro =
    salvar.error instanceof ErroApi
      ? salvar.error.message
      : salvar.error
        ? "Falha inesperada ao salvar o usuário."
        : null;

  return (
    <>
      <CabecalhoPagina
        titulo={editando ? `Editar ${inicial.username}` : "Novo usuário"}
        descricao={
          editando
            ? "Alterações passam a valer no próximo carregamento de tela da pessoa. Para trocar a senha, use o botão Senha na lista."
            : "A conta passa a funcionar assim que for salva. A senha é definida por você e não é enviada por e-mail — anote e comunique à pessoa."
        }
      />

      <div className="max-w-2xl">
        <Secao titulo="Dados da conta">
          <form onSubmit={enviar}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="u-username">Login</FieldLabel>
                <Input
                  id="u-username"
                  value={valores.username}
                  required
                  autoComplete="off"
                  onChange={(e) => campo("username", e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="u-nome">Nome</FieldLabel>
                <Input
                  id="u-nome"
                  value={valores.nome}
                  onChange={(e) => campo("nome", e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="u-email">E-mail</FieldLabel>
                <Input
                  id="u-email"
                  type="email"
                  value={valores.email}
                  onChange={(e) => campo("email", e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="u-perfil">Perfil</FieldLabel>
                <Select
                  value={valores.perfil}
                  onValueChange={(valor) => valor && campo("perfil", valor as Perfil)}
                >
                  <SelectTrigger id="u-perfil" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {PERFIS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {ROTULO_PERFIL[p]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>{DESCRICAO_PERFIL[valores.perfil]}</FieldDescription>
              </Field>

              {valores.perfil === "vendedor" && (
                <Field>
                  <FieldLabel htmlFor="u-vendedor">Código do vendedor</FieldLabel>
                  <Select
                    value={valores.vendedor_codigo}
                    onValueChange={(valor) => campo("vendedor_codigo", valor ?? "")}
                  >
                    <SelectTrigger id="u-vendedor" className="w-full">
                      <SelectValue placeholder="selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {vendedores.map((v) => (
                          <SelectItem key={v.codigo} value={v.codigo}>
                            {v.codigo} — {v.nome}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Sem o vínculo com um código do Protheus, a pessoa entra e não vê tela
                    nenhuma: é o código que define as linhas do escopo dela.
                  </FieldDescription>
                </Field>
              )}

              {!editando && (
                <Field>
                  <FieldLabel htmlFor="u-senha">Senha inicial</FieldLabel>
                  <Input
                    id="u-senha"
                    type="text"
                    value={valores.senha}
                    required
                    autoComplete="new-password"
                    onChange={(e) => campo("senha", e.target.value)}
                  />
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="u-ativo">Situação</FieldLabel>
                <Select
                  value={valores.ativo ? "1" : "0"}
                  onValueChange={(valor) => campo("ativo", valor === "1")}
                >
                  <SelectTrigger id="u-ativo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="1">Ativo</SelectItem>
                      <SelectItem value="0">Inativo (não entra)</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            <div className="mt-5 flex gap-2">
              <Button type="submit" disabled={salvar.isPending}>
                {salvar.isPending ? "Salvando…" : "Salvar"}
              </Button>
              <Button variant="outline" type="button" onClick={() => navegar("/usuarios")}>
                Cancelar
              </Button>
            </div>

            {erro && (
              <div className="mt-4">
                <Erro mensagem={erro} />
              </div>
            )}
          </form>
        </Secao>
      </div>
    </>
  );
}

function Carregando() {
  return (
    <>
      <CabecalhoPagina titulo="Usuário" descricao="Carregando o cadastro…" />
      <SkeletonTabela linhas={3} colunas={2} />
    </>
  );
}
