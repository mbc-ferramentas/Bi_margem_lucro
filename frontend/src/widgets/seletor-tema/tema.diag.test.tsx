import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { SeletorTema } from "@widgets/seletor-tema";
import { definirTema, iniciarTema } from "@compartilhado/lib/tema";

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.className = "";
});

describe("tema", () => {
  it("definirTema escreve a classe .dark na raiz", () => {
    definirTema("escuro");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    definirTema("claro");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("o menu troca o tema ao escolher Escuro", async () => {
    definirTema("claro");
    const usuario = userEvent.setup();
    render(<SeletorTema />);
    await usuario.click(screen.getByRole("button", { name: /^Tema:/ }));
    await usuario.click(await screen.findByRole("menuitemradio", { name: "Escuro" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("iniciarTema aplica a preferencia salva", () => {
    localStorage.setItem("bi.tema", "escuro");
    iniciarTema();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
