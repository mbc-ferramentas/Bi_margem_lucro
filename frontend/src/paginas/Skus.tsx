import { useState } from "react";

import { useSkus } from "../api/hooks";
import type { Filtros } from "../api/tipos";
import { BarraFiltros } from "../componentes/Filtros";
import { Erro, Vazio } from "../componentes/Layout";
import { Paginacao } from "../componentes/Paginacao";
import { SeletorTema } from "../componentes/SeletorTema";
import { SkeletonTabela } from "../componentes/Skeleton";
import { inteiro, moeda, numeroBruto, percentual } from "../formato";

const COLUNAS = [
  { chave: "sku", rotulo: "SKU", num: false },
  { chave: null, rotulo: "Descrição", num: false },
  { chave: null, rotulo: "Grupo", num: false },
  { chave: "quantidade", rotulo: "Qtd", num: true },
  { chave: "receita", rotulo: "Receita", num: true },
  { chave: "margem", rotulo: "Margem", num: true },
  { chave: "margem_pct", rotulo: "Margem %", num: true },
] as const;

export function Skus() {
  const [filtros, setFiltros] = useState<Filtros>({});
  const [ordenar, setOrdenar] = useState("-margem");
  const [offset, setOffset] = useState(0);
  const [itensPorPagina, setItensPorPagina] = useState(25);

  const { data, isPending, isError, error } = useSkus(filtros, ordenar, offset, itensPorPagina);

  function ordenarPor(chave: string | null) {
    if (!chave) return;
    setOffset(0);
    setOrdenar((atual) => (atual === `-${chave}` ? chave : `-${chave}`));
  }

  function mudarFiltros(f: Filtros) {
    setOffset(0);
    setFiltros(f);
  }

  const total = data?.total ?? 0;

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Por SKU</h1>
          <p className="subtitulo">
            Margem bruta por item. Linhas sem custo confiável e outliers de custo
            ficam de fora do cálculo.
          </p>
        </div>
        <SeletorTema />
      </div>

      <BarraFiltros valor={filtros} aoMudar={mudarFiltros} />

      {isError && <Erro mensagem={(error as Error).message} />}
      {isPending && <SkeletonTabela linhas={12} colunas={7} />}

      {data && data.itens.length === 0 && (
        <Vazio mensagem="Nenhum item no período e filtros selecionados." />
      )}

      {data && data.itens.length > 0 && (
        <div className="cartao">
          <div className="cabecalho">
            <div>
              <h2>{inteiro(total)} SKUs</h2>
              <p className="nota">Clique no cabeçalho para ordenar.</p>
            </div>
          </div>

          <div className="rolagem">
            <table>
              <thead>
                <tr>
                  {COLUNAS.map((c) => (
                    <th
                      key={c.rotulo}
                      className={c.num ? "num" : undefined}
                      onClick={() => ordenarPor(c.chave)}
                      style={{ cursor: c.chave ? "pointer" : "default" }}
                    >
                      {c.rotulo}
                      {c.chave &&
                        ordenar.replace("-", "") === c.chave &&
                        (ordenar.startsWith("-") ? " ↓" : " ↑")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.itens.map((item) => (
                  <tr key={item.sku}>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{item.sku}</td>
                    <td
                      style={{
                        maxWidth: 340,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={item.descricao ?? ""}
                    >
                      {item.descricao ?? "—"}
                    </td>
                    <td>{item.grupo ?? "—"}</td>
                    <td className="num">{inteiro(item.quantidade)}</td>
                    <td className="num">{moeda(item.receita)}</td>
                    <td
                      className={numeroBruto(item.margem) < 0 ? "num negativo" : "num"}
                    >
                      {moeda(item.margem)}
                    </td>
                    <td
                      className={
                        numeroBruto(item.margem_pct) < 0 ? "num negativo" : "num"
                      }
                    >
                      {percentual(item.margem_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao total={total} offset={offset} itensPorPagina={itensPorPagina} aoMudarOffset={setOffset} aoMudarItensPorPagina={(quantidade) => { setOffset(0); setItensPorPagina(quantidade); }} />
        </div>
      )}
    </>
  );
}
