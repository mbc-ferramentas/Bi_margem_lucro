import { describe, expect, it } from "vitest";

import { rotulosDoPeriodo } from "@compartilhado/lib/formato";

describe("rotulosDoPeriodo", () => {
  it("numera as semanas dentro do recorte", () => {
    expect(rotulosDoPeriodo(["2026-07-06", "2026-07-13"], "semana")).toEqual(["S1", "S2"]);
  });

  it("mantém a data nos dias e a competência nos meses", () => {
    expect(rotulosDoPeriodo(["2026-07-06", "2026-07-07"], "dia")).toEqual(["06/07", "07/07"]);
    expect(rotulosDoPeriodo(["2026-07-01", "2026-08-01"], "mes")).toEqual([
      "jul/26",
      "ago/26",
    ]);
  });
});
