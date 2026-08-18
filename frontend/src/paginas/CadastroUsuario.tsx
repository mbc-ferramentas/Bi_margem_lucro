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

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ErroApi } from "../api/cliente";
import { useSalvarUsuario, useUsuarios } from "../api/hooks";
import { PERFIS, type Perfil } from "../api/tipos";
import { Erro } from "../componentes/Layout";
import { SeletorTema } from "../componentes/SeletorTema";
import { SkeletonTabela } from "../componentes/Skeleton";

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
      <div className="cabecalho">
        <div>
          <h1>{editando ? `Editar ${inicial.username}` : "Novo usuário"}</h1>
          <p style={{ color: "var(--text-secondary)", maxWidth: 640 }}>
            {editando
              ? "Alterações passam a valer no próximo carregamento de tela da pessoa. Para trocar a senha, use o botão Senha na lista."
              : "A conta passa a funcionar assim que for salva. A senha é definida por você e não é enviada por e-mail — anote e comunique à pessoa."}
          </p>
        </div>
        <SeletorTema />
      </div>

      <form className="cartao" onSubmit={enviar} style={{ maxWidth: 640 }}>
        <div className="filtros">
          <div className="campo">
            <label htmlFor="u-username">Login</label>
            <input
              id="u-username"
              value={valores.username}
              required
              autoComplete="off"
              onChange={(e) => campo("username", e.target.value)}
            />
          </div>

          <div className="campo">
            <label htmlFor="u-nome">Nome</label>
            <input
              id="u-nome"
              value={valores.nome}
              onChange={(e) => campo("nome", e.target.value)}
            />
          </div>

          <div className="campo">
            <label htmlFor="u-email">E-mail</label>
            <input
              id="u-email"
              type="email"
              value={valores.email}
              onChange={(e) => campo("email", e.target.value)}
            />
          </div>

          <div className="campo">
            <label htmlFor="u-perfil">Perfil</label>
            <select
              id="u-perfil"
              value={valores.perfil}
              onChange={(e) => campo("perfil", e.target.value as Perfil)}
            >
              {PERFIS.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PERFIL[p]}
                </option>
              ))}
            </select>
          </div>

          {valores.perfil === "vendedor" && (
            <div className="campo">
              <label htmlFor="u-vendedor">Código do vendedor</label>
              <select
                id="u-vendedor"
                value={valores.vendedor_codigo}
                required
                onChange={(e) => campo("vendedor_codigo", e.target.value)}
              >
                <option value="">selecione…</option>
                {vendedores.map((v) => (
                  <option key={v.codigo} value={v.codigo}>
                    {v.codigo} — {v.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!editando && (
            <div className="campo">
              <label htmlFor="u-senha">Senha inicial</label>
              <input
                id="u-senha"
                type="text"
                value={valores.senha}
                required
                autoComplete="new-password"
                onChange={(e) => campo("senha", e.target.value)}
              />
            </div>
          )}

          <div className="campo">
            <label htmlFor="u-ativo">Situação</label>
            <select
              id="u-ativo"
              value={valores.ativo ? "1" : "0"}
              onChange={(e) => campo("ativo", e.target.value === "1")}
            >
              <option value="1">Ativo</option>
              <option value="0">Inativo (não entra)</option>
            </select>
          </div>
        </div>

        <p className="nota">{DESCRICAO_PERFIL[valores.perfil]}</p>
        {valores.perfil === "vendedor" && (
          <p className="nota">
            Sem o vínculo com um código do Protheus, a pessoa entra e não vê tela
            nenhuma: é o código que define as linhas do escopo dela.
          </p>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="botao" type="submit" disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </button>
          <button
            className="botao-alt"
            type="button"
            onClick={() => navegar("/usuarios")}
          >
            Cancelar
          </button>
        </div>

        {erro && <Erro mensagem={erro} />}
      </form>
    </>
  );
}

function Carregando() {
  return (
    <>
      <div className="cabecalho">
        <h1>Usuário</h1>
        <SeletorTema />
      </div>
      <SkeletonTabela linhas={3} colunas={2} />
    </>
  );
}
