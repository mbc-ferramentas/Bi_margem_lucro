/** Tabela de dados do BI.
 *
 *  Antes deste componente havia dez `<table>` escritas a mao, cada uma com sua
 *  propria copia do `aria-sort`, do realce de negativo e do truncamento. O que
 *  variava de verdade entre elas era so a lista de colunas.
 *
 *  Duas coisas que parecem detalhe e nao sao:
 *
 *  - **Ordenacao e uma string** no formato da API (`"margem"` / `"-margem"`),
 *    porque na maioria das telas quem ordena e o Postgres, nao o navegador. O
 *    componente traduz de e para o estado do TanStack, mas o contrato publico
 *    continua sendo a string — e o que vai na query e o que mora na URL.
 *  - **Dinheiro chega como string** (o backend serializa Decimal como texto
 *    para nao perder centavos). Ordenar no cliente pela string crua daria ordem
 *    alfabetica: "9" depois de "10". Por isso toda coluna ordenavel no cliente
 *    precisa declarar `ordenarPor`.
 */

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@compartilhado/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@compartilhado/ui/atomos/table";
import { Paginacao } from "./Paginacao";
import { SkeletonTabela } from "./Skeleton";
import { Vazio } from "./Layout";

export type Coluna<T> = {
  /** Chave de ordenacao mandada a API. `null` marca coluna nao-ordenavel. */
  chave: string | null;
  rotulo: string;
  /** Coluna numerica: alinha a direita e liga as figuras tabulares. */
  num?: boolean;
  celula: (linha: T) => React.ReactNode;
  /** Pinta a celula com a cor de erro (ex.: margem abaixo de zero). */
  negativo?: (linha: T) => boolean;
  /** Largura maxima em px; acima dela o texto trunca e ganha `title`. */
  truncar?: number;
  titulo?: (linha: T) => string;
  /** Obrigatorio para ordenar no cliente: devolve o numero por tras do texto. */
  ordenarPor?: (linha: T) => number;
  /** Coluna de identidade: fica congelada a esquerda na rolagem horizontal.
   *  Numa tabela de doze colunas e justamente a que diz de quem e a linha. */
  fixa?: boolean;
  /** Coluna de acao: nao encolhe e nao quebra linha. */
  acao?: boolean;
};

export type Ordenacao = {
  /** `"margem"` ou `"-margem"`. */
  valor: string;
  aoMudar: (valor: string) => void;
  /** "servidor" (padrao) so avisa o pai; "cliente" reordena aqui mesmo. */
  modo?: "servidor" | "cliente";
};

export type PaginacaoTabela = {
  total: number;
  offset: number;
  itensPorPagina: number;
  aoMudarOffset: (offset: number) => void;
  aoMudarItensPorPagina: (quantidade: number) => void;
  /** "servidor": a API ja devolveu so a pagina. "cliente": fatiar aqui. */
  modo: "servidor" | "cliente";
};

type Props<T> = {
  linhas: readonly T[];
  colunas: readonly Coluna<T>[];
  chaveLinha: (linha: T) => string;
  rotuloAcessivel: string;
  ordenacao?: Ordenacao;
  paginacao?: PaginacaoTabela;
  carregando?: boolean;
  vazio?: string;
};

/** `"-margem"` → `[{ id: "margem", desc: true }]`. */
function paraEstado(valor: string): SortingState {
  if (!valor) return [];
  const desc = valor.startsWith("-");
  return [{ id: desc ? valor.slice(1) : valor, desc }];
}

export function Tabela<T>({
  linhas,
  colunas,
  chaveLinha,
  rotuloAcessivel,
  ordenacao,
  paginacao,
  carregando,
  vazio = "Nenhum resultado para este recorte.",
}: Props<T>) {
  const definicoes = useMemo<ColumnDef<T>[]>(
    () =>
      colunas.map((coluna, indice) => ({
        // Coluna sem chave de ordenacao ainda precisa de id unico para o
        // TanStack — o rotulo serve, e duas colunas nao repetem rotulo.
        id: coluna.chave ?? `col-${indice}-${coluna.rotulo}`,
        header: coluna.rotulo,
        enableSorting: coluna.chave !== null,
        accessorFn: coluna.ordenarPor ?? (() => 0),
        sortingFn: "basic",
        cell: ({ row }) => coluna.celula(row.original),
        meta: coluna,
      })),
    [colunas],
  );

  const ordenacaoNoCliente = ordenacao?.modo === "cliente";

  const tabela = useReactTable({
    data: linhas as T[],
    columns: definicoes,
    getRowId: (linha) => chaveLinha(linha),
    state: { sorting: ordenacao ? paraEstado(ordenacao.valor) : [] },
    manualSorting: !ordenacaoNoCliente,
    getCoreRowModel: getCoreRowModel(),
    ...(ordenacaoNoCliente ? { getSortedRowModel: getSortedRowModel() } : {}),
  });

  if (carregando) {
    return <SkeletonTabela linhas={8} colunas={colunas.length} />;
  }

  let visiveis = tabela.getRowModel().rows;
  if (paginacao?.modo === "cliente") {
    visiveis = visiveis.slice(
      paginacao.offset,
      paginacao.offset + paginacao.itensPorPagina,
    );
  }

  if (!visiveis.length) return <Vazio mensagem={vazio} />;

  function alternar(chave: string | null) {
    if (!chave || !ordenacao) return;
    // Um clique na coluna ja ordenada inverte; numa coluna nova comeca
    // decrescente, que e o que se quer olhar primeiro num ranking.
    ordenacao.aoMudar(ordenacao.valor === `-${chave}` ? chave : `-${chave}`);
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <Table aria-label={rotuloAcessivel}>
          <TableHeader>
            <TableRow>
              {colunas.map((coluna, indice) => {
                const ordenadaPor = ordenacao?.valor.replace("-", "");
                const ativa = !!coluna.chave && ordenadaPor === coluna.chave;
                const desc = ordenacao?.valor.startsWith("-");
                return (
                  <TableHead
                    key={coluna.chave ?? `${indice}-${coluna.rotulo}`}
                    aria-sort={
                      !ativa ? "none" : desc ? "descending" : "ascending"
                    }
                    className={cn(
                      "text-[11px] tracking-wider uppercase",
                      coluna.num && "text-right",
                      coluna.acao && "w-px whitespace-nowrap",
                      coluna.fixa && "sticky left-0 z-20 bg-card",
                      ativa && "text-foreground",
                    )}
                  >
                    {coluna.chave ? (
                      <button
                        type="button"
                        onClick={() => alternar(coluna.chave)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-foreground",
                          coluna.num && "flex-row-reverse",
                        )}
                      >
                        {coluna.rotulo}
                        {ativa &&
                          (desc ? (
                            <ChevronDownIcon className="size-3" aria-hidden="true" />
                          ) : (
                            <ChevronUpIcon className="size-3" aria-hidden="true" />
                          ))}
                      </button>
                    ) : (
                      coluna.rotulo
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.map((linha) => (
              <TableRow key={linha.id}>
                {linha.getVisibleCells().map((celula) => {
                  const coluna = celula.column.columnDef.meta as Coluna<T>;
                  return (
                    <TableCell
                      key={celula.id}
                      title={coluna.titulo?.(linha.original)}
                      style={coluna.truncar ? { maxWidth: coluna.truncar } : undefined}
                      className={cn(
                        coluna.num && "num-tabular text-right",
                        coluna.truncar && "truncate",
                        coluna.acao && "w-px whitespace-nowrap",
                        coluna.fixa && "sticky left-0 z-10 bg-card",
                        coluna.negativo?.(linha.original) && "text-destructive",
                      )}
                    >
                      {flexRender(celula.column.columnDef.cell, celula.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {paginacao && (
        <Paginacao
          total={paginacao.total}
          offset={paginacao.offset}
          itensPorPagina={paginacao.itensPorPagina}
          aoMudarOffset={paginacao.aoMudarOffset}
          aoMudarItensPorPagina={paginacao.aoMudarItensPorPagina}
        />
      )}
    </div>
  );
}
