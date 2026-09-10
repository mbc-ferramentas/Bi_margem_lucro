// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@compartilhado/lib/tema", () => ({ useTema: () => ({ tema: "sistema", definirTema: vi.fn(), resolvido: "claro" }) }));

import { Abas, BarraComposicao } from "./Visual";

afterEach(cleanup);

function ExemploAbas() {
  const [aba, setAba] = useState<"gerencial" | "itens">("gerencial");
  return <Abas valor={aba} aoMudar={setAba} opcoes={[{ valor: "gerencial", rotulo: "Visão gerencial" }, { valor: "itens", rotulo: "Itens" }]} />;
}

describe("componentes de navegação e leitura", () => {
  it("troca a aba com as setas do teclado", async () => {
    const usuario = userEvent.setup();
    render(<ExemploAbas />);
    const primeira = screen.getByRole("tab", { name: "Visão gerencial" });
    primeira.focus();
    await usuario.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Itens" }).getAttribute("aria-selected")).toBe("true");
  });

  it("limita uma composição ao intervalo acessível", () => {
    render(<BarraComposicao valor={1.4} rotulo="Atraso" detalhe="140%" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });
});
