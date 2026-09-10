import { useEu } from "@entidades/sessao";
import {
  BoxesIcon,
  ChartLineIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  PackageIcon,
  StoreIcon,
  UploadIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router";

import { ErroApi, tokens } from "@compartilhado/api/cliente";
import { Button } from "@compartilhado/ui/atomos/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@compartilhado/ui/atomos/sidebar";
import { Erro } from "@compartilhado/ui/moleculas/Estados";
import { Barra } from "@compartilhado/ui/moleculas/Skeleton";

type ItemMenu = { para: string; rotulo: string; fim?: boolean; Icone: typeof PackageIcon };

type GrupoMenu = { titulo: string; somenteAdmin?: boolean; itens: ItemMenu[] };

/** O menu e agrupado por natureza: analisar margem, acompanhar carteira e
 *  administrar o sistema sao tarefas de momentos diferentes. Numa lista plana
 *  "Uploads" ficava na mesma sequencia visual de "Por SKU". */
const GRUPOS: GrupoMenu[] = [
  {
    titulo: "Análise",
    itens: [
      { para: "/", rotulo: "Visão geral", fim: true, Icone: LayoutDashboardIcon },
      // Armazem antes das demais quebras: e a dimensao de fora da hierarquia.
      { para: "/armazens", rotulo: "Por armazém", Icone: BoxesIcon },
      { para: "/vendedores", rotulo: "Por vendedor", Icone: UsersRoundIcon },
      { para: "/skus", rotulo: "Por SKU", Icone: PackageIcon },
      { para: "/canais", rotulo: "Por canal", Icone: StoreIcon },
    ],
  },
  {
    titulo: "Operação",
    itens: [{ para: "/carteira", rotulo: "Carteira em aberto", Icone: ClipboardListIcon }],
  },
  {
    // Esconder o bloco nao e a protecao: a API recusa quem nao e admin. Aqui e
    // so para nao oferecer telas que o usuario receberia 403 ao usar. O flag
    // mora no grupo, e nao no item, porque as duas telas restritas sao
    // exatamente este bloco — assim nunca sobra um titulo sem itens embaixo.
    titulo: "Administração",
    somenteAdmin: true,
    itens: [
      { para: "/uploads", rotulo: "Uploads", Icone: UploadIcon },
      { para: "/usuarios", rotulo: "Usuários", Icone: UsersIcon },
    ],
  },
];

/** Moldura fixa da aplicacao: existe igual nos tres estados (carregando, erro e
 *  pronto), para que a troca entre eles nao desloque nada na tela.
 *
 *  O SidebarProvider precisa envolver os tres — e nao so o estado pronto —
 *  senao a barra apareceria depois do dado, deslocando a pagina inteira. */
function Moldura({ children, menu }: { children: React.ReactNode; menu: React.ReactNode }) {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          {/* A marca vive aqui e so aqui na moldura: o azul #0d1330 com o
              laranja por cima, num quadrado do tamanho do icone recolhido —
              assim ela sobrevive a sidebar em modo icone. */}
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-marca">
              <ChartLineIcon className="size-4 text-marca-acento" />
            </span>
            <div className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-semibold">Margem de Lucro</span>
              <span className="truncate text-[11px] text-muted-foreground">
                Margem bruta · fase 1
              </span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>{menu}</SidebarContent>
      </Sidebar>
      <SidebarInset>
        <main className="mx-auto w-full max-w-[1760px] px-4 pt-4 pb-12 sm:px-7 sm:pt-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function Layout() {
  const navegar = useNavigate();
  const { data: eu, isPending, error } = useEu();

  function sair() {
    tokens.limpar();
    navegar("/login", { replace: true });
  }

  const botaoSair = (
    <SidebarFooter>
      <SidebarSeparator />
      <Button variant="ghost" size="sm" onClick={sair} className="justify-start">
        <LogOutIcon data-icon="inline-start" />
        <span className="group-data-[collapsible=icon]:hidden">Sair</span>
      </Button>
    </SidebarFooter>
  );

  // O menu depende do perfil, e o perfil vem de /auth/eu. Renderizar antes da
  // resposta faria o item de administrador surgir alguns instantes depois dos
  // demais — o usuario ve o menu mudar sozinho e duvida do que esta vendo.
  // Por isso a moldura sobe na hora e so os itens esperam.
  if (isPending) {
    return (
      <Moldura
        menu={
          <div role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">Carregando</span>
            <div aria-hidden="true">
              {/* Os titulos nao dependem de /auth/eu: entram como texto mesmo, e
                  so os itens esperam em barra. */}
              {GRUPOS.filter((g) => !g.somenteAdmin).map((g) => (
                <SidebarGroup key={g.titulo}>
                  <SidebarGroupLabel>{g.titulo}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {g.itens.map((p) => (
                        <SidebarMenuItem key={p.para} className="px-2 py-1.5">
                          <Barra largura="70%" altura="11px" />
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
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
        // Sem o perfil nao da para montar o menu, mas o botao de sair precisa
        // existir: sem ele o usuario fica preso numa tela sem saida.
        menu={botaoSair}
      >
        <Erro mensagem="Não foi possível carregar seu perfil. Recarregue a página." />
      </Moldura>
    );
  }

  const ehAdmin = eu.perfis.includes("admin");
  const grupos = GRUPOS.filter((g) => !g.somenteAdmin || ehAdmin);

  return (
    <Moldura
      menu={
        <>
          {grupos.map((g) => (
            <SidebarGroup key={g.titulo}>
              <SidebarGroupLabel>{g.titulo}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {g.itens.map((p) => (
                    <SidebarMenuItem key={p.para}>
                      <NavLink to={p.para} end={p.fim}>
                        {({ isActive }) => (
                          <SidebarMenuButton isActive={isActive} tooltip={p.rotulo} render={<span />}>
                            <p.Icone />
                            <span>{p.rotulo}</span>
                          </SidebarMenuButton>
                        )}
                      </NavLink>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}

          <div className="mt-auto px-2 pb-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            <div className="truncate text-foreground">{eu.nome || eu.username}</div>
            <div className="truncate">{eu.perfis.join(", ")}</div>
            {eu.vendedor && <div>Vendedor {eu.vendedor.codigo}</div>}
          </div>
          {botaoSair}
        </>
      }
    >
      <Outlet />
    </Moldura>
  );
}
