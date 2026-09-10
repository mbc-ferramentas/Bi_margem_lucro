import { describe, expect, it } from "vitest";

import {
  fatiaDoPeriodo,
  fimDaFatia,
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
  it("um mes vem em semanas", () => {
    expect(granularidadeAuto({ inicio: "2026-07-01", fim: "2026-07-31" })).toBe("semana");
  });

  it("duas semanas vem em semanas — S1 e S2, nao 14 barras", () => {
    expect(granularidadeAuto({ inicio: "2026-07-06", fim: "2026-07-19" })).toBe("semana");
  });

  it("dia so quando o recorte cabe numa semana", () => {
    expect(granularidadeAuto({ inicio: "2026-07-06", fim: "2026-07-12" })).toBe("dia");
    expect(granularidadeAuto({ inicio: "2026-07-06", fim: "2026-07-13" })).toBe("semana");
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
    expect(granularidadeEfetiva(mes, null)).toBe("semana");
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

describe("fimDaFatia", () => {
  it("dia é ele mesmo", () => {
    expect(fimDaFatia("2026-07-15", "dia")).toBe("2026-07-15");
  });

  it("semana fecha no domingo, atravessando a virada do mês", () => {
    expect(fimDaFatia("2026-07-06", "semana")).toBe("2026-07-12");
    expect(fimDaFatia("2026-07-27", "semana")).toBe("2026-08-02");
  });

  it("mês fecha no último dia, inclusive fevereiro bissexto", () => {
    expect(fimDaFatia("2026-07-01", "mes")).toBe("2026-07-31");
    expect(fimDaFatia("2024-02-01", "mes")).toBe("2024-02-29");
    expect(fimDaFatia("2026-02-01", "mes")).toBe("2026-02-28");
  });
});

describe("fatiaDoPeriodo", () => {
  const janela = { inicio: "2026-07-15", fim: "2026-07-31" };

  it("grampeia a primeira semana, que começa antes do filtro", () => {
    // A serie devolve a segunda-feira (13/07), anterior ao recorte: sem clamp o
    // clique ampliaria o periodo em vez de detalhar.
    expect(fatiaDoPeriodo("2026-07-13", "semana", janela)).toEqual({
      inicio: "2026-07-15",
      fim: "2026-07-19",
    });
  });

  it("grampeia a última semana, que termina depois do filtro", () => {
    expect(fatiaDoPeriodo("2026-07-27", "semana", janela)).toEqual({
      inicio: "2026-07-27",
      fim: "2026-07-31",
    });
  });

  it("mantém a fatia inteira quando ela cabe na janela", () => {
    expect(fatiaDoPeriodo("2026-07-20", "semana", janela)).toEqual({
      inicio: "2026-07-20",
      fim: "2026-07-26",
    });
  });

  it("sem janela, devolve a fatia crua", () => {
    expect(fatiaDoPeriodo("2026-07-01", "mes", null)).toEqual({
      inicio: "2026-07-01",
      fim: "2026-07-31",
    });
  });
});
