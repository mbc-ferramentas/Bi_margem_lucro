import { describe, expect, it } from "vitest";

import {
  granularidadeAuto,
  granularidadeEfetiva,
  granularidadesPermitidas,
  janelaEfetiva,
  periodoAnterior,
  rotuloJanela,
  tamanhoEmDias,
} from "./periodo";

const BASE = { inicio: "2026-01-01", fim: "2026-07-31" };

describe("janelaEfetiva", () => {
  it("usa o filtro quando ele existe", () => {
    expect(
      janelaEfetiva({ data_inicio: "2026-04-01", data_fim: "2026-07-31" }, BASE),
    ).toEqual({ inicio: "2026-04-01", fim: "2026-07-31" });
  });

  it("cai para os extremos da base quando o filtro esta aberto", () => {
    expect(janelaEfetiva({}, BASE)).toEqual({ inicio: "2026-01-01", fim: "2026-07-31" });
  });

  it("fecha so o lado que falta", () => {
    expect(janelaEfetiva({ data_inicio: "2026-05-10" }, BASE)).toEqual({
      inicio: "2026-05-10",
      fim: "2026-07-31",
    });
  });

  it("devolve null sem base conhecida nem filtro", () => {
    expect(janelaEfetiva({}, { inicio: null, fim: null })).toBeNull();
    expect(janelaEfetiva({})).toBeNull();
  });

  it("devolve null com janela invertida", () => {
    expect(
      janelaEfetiva({ data_inicio: "2026-07-01", data_fim: "2026-04-01" }, BASE),
    ).toBeNull();
  });
});

describe("tamanhoEmDias", () => {
  it("conta as duas pontas", () => {
    expect(tamanhoEmDias({ inicio: "2026-07-01", fim: "2026-07-01" })).toBe(1);
    expect(tamanhoEmDias({ inicio: "2026-07-01", fim: "2026-07-31" })).toBe(31);
  });

  it("atravessa a virada do ano", () => {
    expect(tamanhoEmDias({ inicio: "2025-12-31", fim: "2026-01-01" })).toBe(2);
  });
});

describe("periodoAnterior", () => {
  it("desloca a janela pelo proprio comprimento em dias", () => {
    expect(
      periodoAnterior({ data_inicio: "2026-07-01", data_fim: "2026-07-31" }, BASE),
    ).toMatchObject({ data_inicio: "2026-05-31", data_fim: "2026-06-30" });
  });

  it("um dia compara com o dia anterior, atravessando o ano", () => {
    expect(
      periodoAnterior({ data_inicio: "2026-01-01", data_fim: "2026-01-01" }, BASE),
    ).toMatchObject({ data_inicio: "2025-12-31", data_fim: "2025-12-31" });
  });

  it("preserva as demais dimensoes do recorte", () => {
    const anterior = periodoAnterior(
      {
        data_inicio: "2026-07-01",
        data_fim: "2026-07-31",
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
    expect(periodoAnterior({}, { inicio: null, fim: null })).toBeNull();
  });
});

describe("granularidadeAuto", () => {
  it("um mes vem em dias", () => {
    expect(granularidadeAuto({ inicio: "2026-07-01", fim: "2026-07-31" })).toBe("dia");
  });

  it("troca para semana quando passa do teto diario", () => {
    // 45 dias e o ultimo recorte que ainda cabe em barras diarias.
    expect(granularidadeAuto({ inicio: "2026-07-01", fim: "2026-08-14" })).toBe("dia");
    expect(granularidadeAuto({ inicio: "2026-07-01", fim: "2026-08-15" })).toBe("semana");
  });

  it("troca para mes quando passa do teto semanal", () => {
    expect(granularidadeAuto({ inicio: "2026-01-01", fim: "2026-06-30" })).toBe("semana");
    expect(granularidadeAuto({ inicio: "2026-01-01", fim: "2026-12-31" })).toBe("mes");
  });

  it("sem janela agrega por mes", () => {
    expect(granularidadeAuto(null)).toBe("mes");
  });
});

describe("granularidadeEfetiva", () => {
  const mes = { inicio: "2026-07-01", fim: "2026-07-31" };
  const ano = { inicio: "2026-01-01", fim: "2026-12-31" };

  it("sem escolha, segue o automatico", () => {
    expect(granularidadeEfetiva(mes, null)).toBe("dia");
  });

  it("respeita a escolha do usuario quando ela cabe na janela", () => {
    expect(granularidadeEfetiva(mes, "mes")).toBe("mes");
    expect(granularidadeEfetiva(ano, "mes")).toBe("mes");
  });

  it("ignora a escolha que nao cabe — 365 barras diarias nao sao um grafico", () => {
    expect(granularidadeEfetiva(ano, "dia")).toBe("mes");
    expect(granularidadesPermitidas(ano)).toEqual(["semana", "mes"]);
    expect(granularidadesPermitidas(mes)).toEqual(["dia", "semana", "mes"]);
  });
});

describe("rotuloJanela", () => {
  it("resume um dia so", () => {
    expect(rotuloJanela({ data_inicio: "2026-07-15", data_fim: "2026-07-15" })).toBe(
      "15/07/2026",
    );
  });

  it("escreve o intervalo", () => {
    expect(rotuloJanela({ data_inicio: "2025-12-01", data_fim: "2026-03-31" })).toBe(
      "01/12/2025 a 31/03/2026",
    );
  });

  it("devolve null sem janela fechada", () => {
    expect(rotuloJanela({})).toBeNull();
  });
});
