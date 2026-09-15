import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { detalheCargaSchema } from "@entidades/carga";
import { ConteudoDetalhe } from "./DetalheCarga";

afterEach(cleanup);

// Payload como a API devolve: passa pelo schema para que o teste quebre junto
// com o contrato, e nao so com o layout.
const carga = detalheCargaSchema.parse({
  id: 7,
  lote: "3f1c2d4e-0000-4000-8000-000000000000",
  arquivo: "SD2",
  status: "sucesso",
  origem: "upload",
  usuario: "admin",
  criado_em: "2026-09-15T10:45:16-03:00",
  competencia: "2026-07-01",
  competencias: ["2026-07"],
  linhas_lidas: 38047,
  linhas_gravadas: 38047,
  duracao_ms: 4200,
  alertas: 2,
  mensagem: "",
  nome_original: "sd2 julho.csv",
  tamanho_bytes: 12_345_678,
  sha256: "a".repeat(64),
  dt_carga: "2026-09-15",
  caminho_parquet: "/data/staging/sd2/part-0.parquet",
  auditoria: {
    linhas_brutas: 38100,
    descartadas_obrigatorias: 50,
    colunas_obrigatorias: ["sku"],
    duplicatas_removidas: 3,
    numeros_invalidos: { vlr_total: 2 },
    datas_invalidas: {},
    opcionais_ausentes: [],
    colunas_ausentes: [],
    divergencia_aritmetica: { linhas: 10, proporcao: 0.0003, limite: 0.005 },
    estrategia: "periodo",
    linhas_substituidas: 37000,
  },
  avisos: ["50 linhas descartadas por campo obrigatorio vazio (sku)"],
  mesmo_lote: [{ id: 6, arquivo: "SB2", status: "sucesso" }],
});

describe("ConteudoDetalhe", () => {
  it("mostra identificacao, funil de volume e qualidade", () => {
    render(<ConteudoDetalhe carga={carga} />);
    expect(screen.getByText("sd2 julho.csv")).toBeTruthy();
    expect(screen.getByText("a".repeat(64))).toBeTruthy();
    expect(screen.getByText(/50 linhas descartadas/)).toBeTruthy();
    expect(screen.getByText("vlr_total: 2 números")).toBeTruthy();
    expect(screen.getByText("SB2 (sucesso)")).toBeTruthy();
    expect(screen.getByText("Substituição da competência inteira")).toBeTruthy();
  });

  it("aceita execucao antiga sem auditoria", () => {
    const antiga = detalheCargaSchema.parse({ ...carga, auditoria: {}, avisos: [], sha256: "" });
    render(<ConteudoDetalhe carga={antiga} />);
    expect(screen.getByText("Carregado")).toBeTruthy();
  });
});
