import { describe, expect, it } from "vitest";

import { janelaEfetiva, periodoAnterior, rotuloJanela } from "./periodo";

const BASE = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];

describe("janelaEfetiva", () => {
  it("usa o filtro quando ele existe", () => {
    expect(janelaEfetiva({ competencia_inicio: "2026-04", competencia_fim: "2026-07" }, BASE)).toEqual(
      { inicio: "2026-04", fim: "2026-07" },
    );
  });

  it("cai para os extremos da base quando o filtro esta aberto", () => {
    expect(janelaEfetiva({}, BASE)).toEqual({ inicio: "2026-01", fim: "2026-07" });
  });

  it("fecha so o lado que falta", () => {
    expect(janelaEfetiva({ competencia_inicio: "2026-05" }, BASE)).toEqual({
      inicio: "2026-05",
      fim: "2026-07",
    });
  });

  it("devolve null sem competencias conhecidas nem filtro", () => {
    expect(janelaEfetiva({}, [])).toBeNull();
  });

  it("devolve null com janela invertida", () => {
    expect(
      janelaEfetiva({ competencia_inicio: "2026-07", competencia_fim: "2026-04" }, BASE),
    ).toBeNull();
  });
});

describe("periodoAnterior", () => {
  it("desloca a janela pelo proprio comprimento", () => {
    expect(
      periodoAnterior({ competencia_inicio: "2026-04", competencia_fim: "2026-07" }, BASE),
    ).toMatchObject({ competencia_inicio: "2025-12", competencia_fim: "2026-03" });
  });

  it("um mes compara com o mes anterior, atravessando o ano", () => {
    expect(
      periodoAnterior({ competencia_inicio: "2026-01", competencia_fim: "2026-01" }, BASE),
    ).toMatchObject({ competencia_inicio: "2025-12", competencia_fim: "2025-12" });
  });

  it("preserva as demais dimensoes do recorte", () => {
    const anterior = periodoAnterior(
      {
        competencia_inicio: "2026-07",
        competencia_fim: "2026-07",
        canal: "Venda interna",
        armazem: ["02"],
        grupo: ["0128", "0129"],
      },
      BASE,
    );
    expect(anterior).toMatchObject({
      canal: "Venda interna",
      armazem: ["02"],
      grupo: ["0128", "0129"],
    });
  });

  it("devolve null quando nao ha como saber a janela", () => {
    expect(periodoAnterior({}, [])).toBeNull();
  });
});

describe("rotuloJanela", () => {
  it("resume um mes so", () => {
    expect(rotuloJanela({ competencia_inicio: "2026-07", competencia_fim: "2026-07" })).toBe(
      "07/2026",
    );
  });

  it("escreve o intervalo", () => {
    expect(rotuloJanela({ competencia_inicio: "2025-12", competencia_fim: "2026-03" })).toBe(
      "12/2025 a 03/2026",
    );
  });

  it("devolve null sem janela fechada", () => {
    expect(rotuloJanela({})).toBeNull();
  });
});
