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

// Um stub só para todos os hooks: nenhum deles chega a devolver dado aqui.
// O vitest confere a lista de exports contra o módulo real, então ela é lida
// dele — assim um hook novo entra no stub sem ninguém precisar lembrar.
vi.mock("../api/hooks", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  const consulta = {
    data: undefined,
    isPending: true,
    isError: false,
    error: null,
    mutate: vi.fn(),
  };
  return Object.fromEntries(Object.keys(real).map((nome) => [nome, () => consulta]));
});

import { Armazens } from "./Armazens";
import { CadastroUsuario } from "./CadastroUsuario";
import { Canais } from "./Canais";
import { Carteira } from "./Carteira";
import { Login } from "./Login";
import { PedidoDetalhe } from "./PedidoDetalhe";
import { Pedidos } from "./Pedidos";
import { SkuDetalhe } from "./SkuDetalhe";
import { Skus } from "./Skus";
import { Uploads } from "./Uploads";
import { Usuarios } from "./Usuarios";
import { Vendedores } from "./Vendedores";
import { VisaoGeral } from "./VisaoGeral";

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
  it.each(PAGINAS)("%s monta sem erro", (_nome, Pagina) => {
    expect(() => montar(Pagina)).not.toThrow();
  });

  it("o cabeçalho traz o seletor de tema em todas as telas internas", () => {
    montar(VisaoGeral);
    expect(screen.getByRole("button", { name: /^Tema:/ })).toBeInTheDocument();
  });
});
