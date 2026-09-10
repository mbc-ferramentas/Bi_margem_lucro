// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { useAbaUrl, useFiltrosUrl } from "./filtrosUrl";
import { mesAtual } from "./modelo/periodo";

afterEach(cleanup);

function Exemplo() {
  const [filtros, setFiltros] = useFiltrosUrl();
  const [aba, setAba] = useAbaUrl(["gerencial", "detalhamento"] as const, "gerencial");
  const local = useLocation();
  return <>
    <output aria-label="url">{local.search}</output>
    <output aria-label="estado">{`${aba}|${filtros.canal ?? ""}`}</output>
    <output aria-label="periodo">{`${filtros.data_inicio ?? ""}..${filtros.data_fim ?? ""}`}</output>
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
    // Limpar o periodo e uma escolha ("Todo o periodo"), e nao volta ao padrao
    // do mes corrente — por isso a sentinela fica na URL.
    expect(screen.getByLabelText("url").textContent).toBe("?aba=detalhamento&periodo=tudo");
    expect(screen.getByLabelText("periodo").textContent).toBe("..");
  });

  it("abre no mês corrente quando a URL não traz período", () => {
    const mes = mesAtual();
    render(<MemoryRouter initialEntries={["/"]}><Exemplo /></MemoryRouter>);
    expect(screen.getByLabelText("periodo").textContent).toBe(`${mes.inicio}..${mes.fim}`);
  });

  it("respeita o período que veio na URL", () => {
    render(<MemoryRouter initialEntries={["/?data_inicio=2026-07-01&data_fim=2026-07-15"]}><Exemplo /></MemoryRouter>);
    expect(screen.getByLabelText("periodo").textContent).toBe("2026-07-01..2026-07-15");
  });

  it("usa a aba padrão para um valor inválido", () => {
    render(<MemoryRouter initialEntries={["/?aba=inexistente"]}><Exemplo /></MemoryRouter>);
    expect(screen.getByLabelText("estado").textContent).toBe("gerencial|");
  });
});
