/** Teste de fumaça: toda página monta sem estourar.
 *
 *  O `tsc` pega erro de tipo, não erro de composição — um `SelectItem` fora do
 *  `SelectGroup`, um `Tabs.Tab` fora da `Tabs.List`, um primitivo do Base UI sem
 *  o contexto que ele exige. Isso só aparece ao renderizar, e este arquivo é o
 *  que garante que aparece aqui, e não na tela de alguém.
 *
 *  As páginas são montadas no estado de carregamento (os hooks de API são
 *  trocados por um stub): o que se está testando é a moldura — cabeçalho,
 *  filtros, abas, menu —, que é onde moram os componentes de UI.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { JSX } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

// Um stub só para todos os hooks de dados: nenhum deles chega a devolver dado
// aqui. A lista de exports é lida do módulo real, então um hook novo entra no
// stub sem ninguém precisar lembrar.
//
// É um mock por entidade, e não um só: desde que os hooks foram fatiados por
// domínio, `api/hooks` não existe mais. Um `vi.mock` apontando para um módulo
// que ninguém importa é ignorado em silêncio — as páginas passariam a montar
// com os hooks de verdade e este arquivo deixaria de testar o que diz testar,
// sem ficar vermelho.
function stubDeHooks(real: Record<string, unknown>) {
  const consulta = {
    data: undefined,
    isPending: true,
    isError: false,
    error: null,
    mutate: vi.fn(),
  };
  return Object.fromEntries(
    Object.entries(real).map(([nome, valor]) =>
      // Só o que começa com `use` vira stub, por segurança: se um módulo de
      // hooks passar a exportar uma constante, ela atravessa intacta.
      nome.startsWith("use") ? [nome, () => consulta] : [nome, valor],
    ),
  );
}

vi.mock("@entidades/armazem/api/hooks", async (importOriginal) =>
  stubDeHooks((await importOriginal()) as Record<string, unknown>),
);
vi.mock("@entidades/carga/api/hooks", async (importOriginal) =>
  stubDeHooks((await importOriginal()) as Record<string, unknown>),
);
vi.mock("@entidades/carteira/api/hooks", async (importOriginal) =>
  stubDeHooks((await importOriginal()) as Record<string, unknown>),
);
vi.mock("@entidades/filtros/api/hooks", async (importOriginal) =>
  stubDeHooks((await importOriginal()) as Record<string, unknown>),
);
vi.mock("@entidades/margem/api/hooks", async (importOriginal) =>
  stubDeHooks((await importOriginal()) as Record<string, unknown>),
);
vi.mock("@entidades/pedido/api/hooks", async (importOriginal) =>
  stubDeHooks((await importOriginal()) as Record<string, unknown>),
);
vi.mock("@entidades/sessao/api/hooks", async (importOriginal) =>
  stubDeHooks((await importOriginal()) as Record<string, unknown>),
);
vi.mock("@entidades/sku/api/hooks", async (importOriginal) =>
  stubDeHooks((await importOriginal()) as Record<string, unknown>),
);
vi.mock("@entidades/usuario/api/hooks", async (importOriginal) =>
  stubDeHooks((await importOriginal()) as Record<string, unknown>),
);
vi.mock("@entidades/vendedor/api/hooks", async (importOriginal) =>
  stubDeHooks((await importOriginal()) as Record<string, unknown>),
);

import { useKpis } from "@entidades/margem";

import { Armazens } from "./armazens";
import { CadastroUsuario } from "./cadastro-usuario";
import { Canais } from "./canais";
import { Carteira } from "./carteira";
import { Login } from "./login";
import { PedidoDetalhe } from "./pedido-detalhe";
import { Pedidos } from "./pedidos";
import { SkuDetalhe } from "./sku-detalhe";
import { Skus } from "./skus";
import { Uploads } from "./uploads";
import { Usuarios } from "./usuarios";
import { Vendedores } from "./vendedores";
import { VisaoGeral } from "./visao-geral";

afterEach(cleanup);

const PAGINAS = [
  ["Visão geral", VisaoGeral],
  ["Por armazém", Armazens],
  ["Por vendedor", Vendedores],
  ["Por SKU", Skus],
  ["Por canal", Canais],
  ["Carteira em aberto", Carteira],
  ["Pedidos", Pedidos],
  ["Detalhe do pedido", PedidoDetalhe],
  ["Detalhe do SKU", SkuDetalhe],
  ["Uploads", Uploads],
  ["Usuários", Usuarios],
  ["Cadastro de usuário", CadastroUsuario],
  ["Login", Login],
] as const;

function montar(Pagina: () => JSX.Element) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter>
        <Pagina />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("páginas", () => {
  // Guarda o proprio andaime: um `vi.mock` apontando para um modulo que ninguem
  // importa nao da erro, so deixa de valer. Sem esta assercao, renomear uma
  // entidade faria as 13 paginas montarem contra a API de verdade e este arquivo
  // continuaria verde, testando outra coisa.
  it("os hooks de dados estão realmente trocados pelo stub", () => {
    expect(useKpis({})).toMatchObject({ isPending: true, data: undefined });
  });

  it.each(PAGINAS)("%s monta sem erro", (_nome, Pagina) => {
    expect(() => montar(Pagina)).not.toThrow();
  });

  it("o cabeçalho traz o seletor de tema em todas as telas internas", () => {
    montar(VisaoGeral);
    expect(screen.getByRole("button", { name: /^Tema:/ })).toBeInTheDocument();
  });
});
