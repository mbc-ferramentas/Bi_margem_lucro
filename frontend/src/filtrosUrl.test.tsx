// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { useAbaUrl, useFiltrosUrl } from "./filtrosUrl";

afterEach(cleanup);

function Exemplo() {
  const [filtros, setFiltros] = useFiltrosUrl();
  const [aba, setAba] = useAbaUrl(["gerencial", "detalhamento"] as const, "gerencial");
  const local = useLocation();
  return <>
    <output aria-label="url">{local.search}</output>
    <output aria-label="estado">{`${aba}|${filtros.canal ?? ""}`}</output>
    <button onClick={() => setFiltros({ ...filtros, canal: "Loja" })}>Filtrar</button>
    <button onClick={() => setAba("detalhamento")}>Detalhar</button>
    <button onClick={() => setFiltros({})}>Limpar</button>
  </>;
}

describe("estado compartilhável da página", () => {
  it("preserva a aba ao alterar e limpar filtros", async () => {
    const usuario = userEvent.setup();
    render(<MemoryRouter initialEntries={["/?aba=detalhamento&canal=Site"]}><Exemplo /></MemoryRouter>);
    await usuario.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(screen.getByLabelText("url").textContent).toContain("aba=detalhamento");
    expect(screen.getByLabelText("url").textContent).toContain("canal=Loja");
    await usuario.click(screen.getByRole("button", { name: "Limpar" }));
    expect(screen.getByLabelText("url").textContent).toBe("?aba=detalhamento");
  });

  it("usa a aba padrão para um valor inválido", () => {
    render(<MemoryRouter initialEntries={["/?aba=inexistente"]}><Exemplo /></MemoryRouter>);
    expect(screen.getByLabelText("estado").textContent).toBe("gerencial|");
  });
});
