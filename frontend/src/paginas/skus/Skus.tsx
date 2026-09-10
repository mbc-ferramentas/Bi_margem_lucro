import { Filtros } from "@compartilhado/api/filtros";
import { ItemSku, useSkus } from "@entidades/sku";
import { EyeIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

import { Button } from "@compartilhado/ui/atomos/button";
import { BarraFiltros } from "@widgets/barra-filtros";
import { SkeletonTabela } from "@compartilhado/ui/moleculas/Skeleton";
import { Tabela, type Coluna } from "@compartilhado/ui/organismos/Tabela";
import { CabecalhoPagina, Erro, Secao, Vazio } from "@compartilhado/ui";
import { escreverFiltros, useFiltrosUrl } from "@entidades/filtros";
import { inteiro, moeda, numeroBruto, percentual } from "@compartilhado/lib/formato";

export function Skus() {
  // O recorte vive na URL, e nao em `useState`: e o que faz o filtro sobreviver
  // a ida ao detalhe do SKU e a volta, e de quebra torna a tela linkavel.
  const [filtros, setFiltros] = useFiltrosUrl();
  const [ordenar, setOrdenar] = useState("-margem");
  const [offset, setOffset] = useState(0);
  const [itensPorPagina, setItensPorPagina] = useState(25);

  const { data, isPending, isError, error } = useSkus(filtros, ordenar, offset, itensPorPagina);
  const consulta = escreverFiltros(filtros);

  function mudarFiltros(f: Filtros) {
    setOffset(0);
    setFiltros(f);
  }

  const total = data?.total ?? 0;

  const colunas: readonly Coluna<ItemSku>[] = useMemo(
    () => [
      { chave: "sku", rotulo: "SKU", fixa: true, celula: (i) => <span className="num-tabular">{i.sku}</span> },
      {
        chave: null,
        rotulo: "Descrição",
        truncar: 340,
        titulo: (i) => i.descricao ?? "",
        celula: (i) => i.descricao ?? "—",
      },
      { chave: null, rotulo: "Grupo", celula: (i) => i.grupo ?? "—" },
      { chave: "quantidade", rotulo: "Qtd", num: true, celula: (i) => inteiro(i.quantidade) },
      { chave: "receita", rotulo: "Receita", num: true, celula: (i) => moeda(i.receita) },
      {
        chave: "margem",
        rotulo: "Margem",
        num: true,
        negativo: (i) => numeroBruto(i.margem) < 0,
        celula: (i) => moeda(i.margem),
      },
      {
        chave: "margem_pct",
        rotulo: "Margem %",
        num: true,
        negativo: (i) => numeroBruto(i.margem_pct) < 0,
        celula: (i) => percentual(i.margem_pct),
      },
      {
        chave: null,
        rotulo: "Ações",
        acao: true,
        celula: (i) => (
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={
              <Link
                to={`/skus/${encodeURIComponent(i.sku)}${consulta ? `?${consulta}` : ""}`}
                aria-label={`Visualizar detalhes do SKU ${i.sku}`}
              />
            }
          >
            <EyeIcon data-icon="inline-start" />
            Visualizar
          </Button>
        ),
      },
    ],
    [consulta],
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Por SKU"
        descricao="Margem bruta por item. Linhas sem custo confiável e outliers de custo ficam de fora do cálculo."
      />

      <BarraFiltros valor={filtros} aoMudar={mudarFiltros} />

      {isError && <Erro mensagem={(error as Error).message} />}
      {isPending && <SkeletonTabela linhas={12} colunas={8} />}

      {data && data.itens.length === 0 && (
        <Vazio mensagem="Nenhum item no período e filtros selecionados." />
      )}

      {data && data.itens.length > 0 && (
        <Secao titulo={`${inteiro(total)} SKUs`} nota="Clique no cabeçalho para ordenar.">
          <Tabela
            linhas={data.itens}
            colunas={colunas}
            chaveLinha={(i) => i.sku}
            rotuloAcessivel="Margem bruta por SKU"
            // Ordenacao e paginacao no servidor: a lista de SKUs nao cabe numa
            // resposta so, entao a API devolve ja recortada.
            ordenacao={{
              valor: ordenar,
              aoMudar: (valor) => {
                setOffset(0);
                setOrdenar(valor);
              },
            }}
            paginacao={{
              modo: "servidor",
              total,
              offset,
              itensPorPagina,
              aoMudarOffset: setOffset,
              aoMudarItensPorPagina: (quantidade) => {
                setOffset(0);
                setItensPorPagina(quantidade);
              },
            }}
          />
        </Secao>
      )}
    </>
  );
}
