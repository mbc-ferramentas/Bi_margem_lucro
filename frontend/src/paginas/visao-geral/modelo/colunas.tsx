/** As colunas da alternativa em tabela do grafico de evolucao. */

import { corDaSerie } from "@compartilhado/grafico";
import { moeda, numeroBruto, percentual } from "@compartilhado/lib/formato";
import type { Granularidade } from "@compartilhado/config";
import type { Coluna } from "@compartilhado/ui/organismos/Tabela";
import type { PontoSerie } from "@entidades/margem";

import { ROTULO_PERIODO } from "./metricas";

export function colunasDaSerie({
  granularidade,
  periodos,
  rotulos,
  canais,
}: {
  granularidade: Granularidade;
  periodos: readonly string[];
  rotulos: readonly string[];
  canais: readonly string[];
}): readonly Coluna<PontoSerie>[] {
  return [
      {
        chave: null,
        rotulo: ROTULO_PERIODO[granularidade],
        fixa: true,
        celula: (p) => rotulos[periodos.indexOf(p.periodo)] ?? p.periodo,
      },
      {
        chave: null,
        rotulo: "Canal",
        celula: (p) => (
          <>
            {/* O quadradinho liga a linha da tabela a serie do grafico: sem ele
                a alternativa em tabela perde a identidade da cor. */}
            <span
              className="mr-1.5 inline-block size-2.5 rounded-[2px] align-baseline"
              style={{ background: corDaSerie(canais.indexOf(p.canal)) }}
              aria-hidden="true"
            />
            {p.canal}
          </>
        ),
      },
      { chave: null, rotulo: "Receita", num: true, celula: (p) => moeda(p.receita) },
      { chave: null, rotulo: "Custo", num: true, celula: (p) => moeda(p.custo) },
      {
        chave: null,
        rotulo: "Margem",
        num: true,
        negativo: (p) => numeroBruto(p.margem) < 0,
        celula: (p) => moeda(p.margem),
      },
      { chave: null, rotulo: "Margem %", num: true, celula: (p) => percentual(p.margem_pct) },
  ];
}
