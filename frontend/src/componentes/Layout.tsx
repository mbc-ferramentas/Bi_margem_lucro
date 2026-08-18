import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";

import { ErroApi, tokens } from "../api/cliente";
import { useEu } from "../api/hooks";
import { Barra } from "./Skeleton";

const PAGINAS = [
  { para: "/", rotulo: "Visão geral", fim: true },
  { para: "/vendedores", rotulo: "Por vendedor" },
  { para: "/skus", rotulo: "Por SKU" },
  { para: "/canais", rotulo: "Por canal" },
  { para: "/carteira", rotulo: "Carteira em aberto" },
  // Esconder o item nao e a protecao: a API recusa quem nao e admin. Aqui e so
  // para nao oferecer uma tela que o usuario receberia 403 ao usar.
  { para: "/uploads", rotulo: "Uploads", somenteAdmin: true },
  { para: "/usuarios", rotulo: "Usuários", somenteAdmin: true },
];

/** Moldura fixa da aplicacao: existe igual nos tres estados (carregando, erro e
 *  pronto), para que a troca entre eles nao desloque nada na tela. */
function Moldura({ children, menu }: { children: React.ReactNode; menu: React.ReactNode }) {
  return (
    <div className="app">
      <nav className="lateral" aria-label="Navegação principal">
        <div className="marca">
          Margem de Lucro
          <small>Margem bruta · fase 1</small>
        </div>
        {menu}
      </nav>
      <main className="conteudo">{children}</main>
    </div>
  );
}

export function Layout() {
  const navegar = useNavigate();
  const { data: eu, isPending, error } = useEu();

  function sair() {
    tokens.limpar();
    navegar("/login", { replace: true });
  }

  // O menu depende do perfil, e o perfil vem de /auth/eu. Renderizar antes da
  // resposta faria o item de administrador surgir alguns instantes depois dos
  // demais — o usuario ve o menu mudar sozinho e duvida do que esta vendo.
  // Por isso a moldura sobe na hora e so os itens esperam.
  if (isPending) {
    return (
      <Moldura
        menu={
          <div role="status" aria-live="polite" aria-busy="true">
            <span style={{ position: "absolute", left: "-9999px" }}>Carregando</span>
            <div aria-hidden="true">
              {PAGINAS.filter((p) => !p.somenteAdmin).map((p) => (
                <div key={p.para} className="nav-item">
                  <Barra largura="70%" altura="11px" />
                </div>
              ))}
            </div>
          </div>
        }
      >
        {null}
      </Moldura>
    );
  }

  // Sessao invalida: o refresh ja foi tentado dentro do cliente e falhou.
  if (error instanceof ErroApi && error.status === 401) {
    tokens.limpar();
    return <Navigate to="/login" replace />;
  }

  if (error || !eu) {
    return (
      <Moldura
        menu={
          // Sem o perfil nao da para montar o menu, mas o botao de sair precisa
          // existir: sem ele o usuario fica preso numa tela sem saida.
          <div className="rodape-lateral">
            <button
              className="botao-alt"
              onClick={sair}
              style={{ marginTop: 8, width: "100%" }}
            >
              Sair
            </button>
          </div>
        }
      >
        <Erro mensagem="Não foi possível carregar seu perfil. Recarregue a página." />
      </Moldura>
    );
  }

  const ehAdmin = eu.perfis.includes("admin");
  const paginas = PAGINAS.filter((p) => !p.somenteAdmin || ehAdmin);

  return (
    <Moldura
      menu={
        <>
          {paginas.map((p) => (
            <NavLink key={p.para} to={p.para} end={p.fim} className="nav-item">
              {p.rotulo}
            </NavLink>
          ))}

          <div className="rodape-lateral">
            <div style={{ color: "var(--lateral-texto)" }}>{eu.nome || eu.username}</div>
            <div>{eu.perfis.join(", ")}</div>
            {eu.vendedor && <div>Vendedor {eu.vendedor.codigo}</div>}
            <button
              className="botao-alt"
              onClick={sair}
              style={{ marginTop: 8, width: "100%" }}
            >
              Sair
            </button>
          </div>
        </>
      }
    >
      <Outlet />
    </Moldura>
  );
}

/** Aviso de escopo. Obrigatorio em toda tela que exibe o canal Marketplace:
 *  a comissao de 12-19% ainda nao esta lancada, e sem o rotulo o numero engana. */
export function AvisoMarketplace({ texto }: { texto: string }) {
  return (
    <div className="aviso" role="note">
      <span className="icone" aria-hidden="true">
        !
      </span>
      <span>{texto}</span>
    </div>
  );
}

export function Erro({ mensagem }: { mensagem: string }) {
  return (
    <div className="cartao erro" role="alert">
      {mensagem}
    </div>
  );
}

export function Vazio({ mensagem }: { mensagem: string }) {
  return <div className="cartao vazio">{mensagem}</div>;
}
