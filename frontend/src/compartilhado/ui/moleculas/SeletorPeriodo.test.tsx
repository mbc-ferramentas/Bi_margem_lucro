// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { SeletorPeriodo } from "@compartilhado/ui/moleculas/SeletorPeriodo";

afterEach(cleanup);

function Exemplo() {
  const [periodo, definir] = useState<{ inicio?: string; fim?: string }>({
    inicio: "2026-07-01",
    fim: "2026-07-31",
  });
  return (
    <SeletorPeriodo
      inicio={periodo.inicio}
      fim={periodo.fim}
      aoMudar={definir}
      base={{ inicio: "2026-01-01", fim: "2026-12-31" }}
    />
  );
}

describe("seletor de período", () => {
  it("mostra o intervalo em dd/mm/aaaa e abre o calendário", async () => {
    const usuario = userEvent.setup();
    render(<Exemplo />);

    // O nome acessivel do gatilho e o rotulo do campo ("Período"); o intervalo
    // e o conteudo dele.
    const gatilho = screen.getByRole("button", { name: "Período" });
    expect(gatilho.textContent).toContain("01/07/2026");
    expect(gatilho.textContent).toContain("31/07/2026");

    // O calendario e o Popover vem de bibliotecas diferentes (react-day-picker
    // dentro do Base UI): so abrindo de verdade da para saber que o par monta.
    await usuario.click(gatilho);
    expect(screen.getByRole("grid", { name: /julho/i })).toBeTruthy();
  });

  it("um atalho troca o recorte inteiro", async () => {
    const usuario = userEvent.setup();
    render(<Exemplo />);

    const gatilho = screen.getByRole("button", { name: "Período" });
    await usuario.click(gatilho);
    await usuario.click(screen.getByRole("button", { name: "Todo o período" }));

    // Sem periodo o rotulo volta para o texto do filtro aberto — e nao para um
    // intervalo pela metade.
    expect(gatilho.textContent).toContain("Todo o período");
  });
});
