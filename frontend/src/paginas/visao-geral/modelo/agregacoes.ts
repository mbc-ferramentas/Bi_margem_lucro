/** As contas que a Visao geral faz sobre a resposta da API antes de desenhar.
 *
 *  Sao funcoes puras de proposito: estavam dentro de `useMemo` no corpo da
 *  pagina, onde nao havia como exercita-las sem montar a tela inteira. */

import { numeroBruto } from "@compartilhado/lib/formato";
import type { LinhaArmazem } from "@entidades/armazem";
import type { ItemSku } from "@entidades/sku";

import { TOPO_ARMAZEM } from "./metricas";

export type TotalArmazem = { rotulo: string; margem: number; receita: number };

/** Margem por armazem, somando os grupos: a API devolve um par armazem x grupo
 *  por linha, e aqui so o total do armazem interessa. */
export function totaisPorArmazem(
  linhas: readonly LinhaArmazem[],
): TotalArmazem[] {
    const totais = new Map<string, { rotulo: string; margem: number; receita: number }>();
    for (const linha of linhas) {
      const codigo = linha.armazem ?? "—";
      const atual = totais.get(codigo) ?? {
        rotulo: linha.armazem_rotulo ?? codigo,
        margem: 0,
        receita: 0,
      };
      atual.margem += numeroBruto(linha.margem);
      atual.receita += numeroBruto(linha.receita);
      totais.set(codigo, atual);
    }
    const ordenados = [...totais.values()].sort((a, b) => b.margem - a.margem);
    if (ordenados.length <= TOPO_ARMAZEM) return ordenados;
    // Cauda somada em "Outros" em vez de truncada: o grafico continua fechando
    // com a margem total do topo da tela.
    const cauda = ordenados.slice(TOPO_ARMAZEM);
    return [
      ...ordenados.slice(0, TOPO_ARMAZEM),
      {
        rotulo: `Outros (${cauda.length})`,
        margem: cauda.reduce((s, a) => s + a.margem, 0),
        receita: cauda.reduce((s, a) => s + a.receita, 0),
      },
    ];
}

/** Os cinco que mais somam e os cinco que mais tiram, numa escala so.
 *
 *  Deduplicado por SKU: num recorte pequeno o mesmo item pode encabecar as duas
 *  pontas, e ele apareceria duas vezes na mesma barra. */
export function extremosDeSku(
  melhores: readonly ItemSku[],
  piores: readonly ItemSku[],
): ItemSku[] {
    const porSku = new Map<string, ItemSku>();
    for (const item of [...melhores, ...piores]) {
      if (!porSku.has(item.sku)) porSku.set(item.sku, item);
    }
    // Ordem crescente: a barra `category` cresce de baixo para cima, entao o
    // pior fica embaixo e o melhor no topo.
    return [...porSku.values()].sort(
      (a, b) => numeroBruto(a.margem) - numeroBruto(b.margem),
    );
}
