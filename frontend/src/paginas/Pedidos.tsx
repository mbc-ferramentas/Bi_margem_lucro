/** Pedidos faturados — o drill-down de `Por armazém` e de `Por vendedor`.
 *
 *  A rota decide qual dimensão vem travada (armazém ou vendedor); o resto do
 *  recorte continua sendo o mesmo de todas as telas de margem. Uma tela só, e
 *  não duas quase iguais, porque o que muda entre as duas origens é de onde vem
 *  o recorte — não o que a tela mostra.
 *
 *  É o oposto da Carteira: lá o pedido ainda não saiu, aqui ele já virou nota.
 *  Por isso a tela fala em **receita faturada**, e não em valor em aberto.
 *
 *  Um número precisa de explicação e ela fica na tela, não no rodapé: a receita
 *  daqui é maior que a da tela `Por armazém`. As agregadas de margem nascem
 *  cortadas (sem custo, outlier de custo, TES que não é venda ficam fora do
 *  indicador), e faturamento não se corta — a nota fiscal existiu. Os dois
 *  números aparecem lado a lado para que ninguém conclua que uma das telas está
 *  errada.
 */

import { ArrowLeftIcon, EyeIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import { usePedidos } from "../api/hooks";
import type { LinhaPedido, ResumoPedidos } from "../api/tipos";
import { Button } from "@/componentes/ui/button";
import { BarraFiltros } from "../componentes/Filtros";
import { Erro, Vazio } from "../componentes/Layout";
import { SkeletonTabela, SkeletonTiles } from "../componentes/Skeleton";
import { Tabela, type Coluna } from "../componentes/Tabela";
import {
  Abas,
  Badge,
  BarraComposicao,
  CabecalhoPagina,
  CartaoKpi,
  GradeInsights,
  GradeKpis,
  Nota,
  PainelInsight,
  Secao,
} from "../componentes/Visual";
import { escreverFiltros, useAbaUrl, useFiltrosUrl } from "../filtrosUrl";
import { dataCurta, inteiro, moeda, numeroBruto, percentual, rotuloNota } from "../formato";


function Resumo({ resumo }: { resumo: ResumoPedidos }) {
  return (
    <GradeKpis>
      <CartaoKpi
        rotulo="Receita faturada"
        valor={moeda(resumo.receita)}
        apoio={`${inteiro(resumo.itens)} itens · ${inteiro(
          resumo.pedidos,
        )} pedidos · ${inteiro(resumo.notas)} notas`}
      />
      <CartaoKpi
        rotulo="Receita no indicador"
        valor={moeda(resumo.receita_no_kpi)}
        apoio={
          resumo.itens_fora_do_kpi > 0
            ? `${inteiro(resumo.itens_fora_do_kpi)} itens fora do KPI de margem`
            : "Todos os itens entram no KPI"
        }
      />
      <CartaoKpi
        rotulo="Margem bruta"
        valor={moeda(resumo.margem)}
        apoio={`${percentual(resumo.margem_pct)} sobre a receita no indicador`}
        tom={numeroBruto(resumo.margem) < 0 ? "critico" : "bom"}
      />
      <CartaoKpi
        rotulo="Ticket médio"
        valor={moeda(resumo.ticket_medio)}
        apoio={`${inteiro(resumo.skus)} SKUs distintos`}
      />
    </GradeKpis>
  );
}

export function Pedidos() {
  // A dimensão de origem vem da rota, não do filtro: a URL é que diz qual tela
  // é esta. Por isso a barra esconde o select correspondente — duas verdades
  // para o mesmo recorte seria pior que uma trava.
  const { armazem = "", vendedor = "" } = useParams();
  const porArmazem = Boolean(armazem);
  const [filtros, setFiltros] = useFiltrosUrl();
  const [aba, setAba] = useAbaUrl(["gerencial", "detalhamento"] as const, "gerencial");
  const [ordenar, setOrdenar] = useState("-margem");
  const [offset, setOffset] = useState(0);
  const [itensPorPagina, setItensPorPagina] = useState(25);

  const consulta = escreverFiltros(filtros);
  const recorte = { ...filtros, ...(porArmazem ? { armazem } : { vendedor }) };
  const base = porArmazem
    ? `/armazens/${armazem}/pedidos`
    : `/vendedores/${encodeURIComponent(vendedor)}/pedidos`;
  const { data, isPending, isError, error } = usePedidos(
    recorte,
    ordenar,
    offset,
    itensPorPagina,
  );

  const colunas: readonly Coluna<LinhaPedido>[] = useMemo(
    () => [
      {
        chave: "pedido",
        rotulo: "Pedido",
        fixa: true,
        celula: (p) => (
          <span className="num-tabular flex flex-wrap items-center gap-1.5">
            <strong>{p.origem === "pdv" ? "Balcão/PDV" : p.chave}</strong>
            {p.armazens > 1 && (
              <Badge>{p.armazens} armazéns</Badge>
            )}
            {/* O marcador veio para ca com o fim da coluna Itens: ele explica por
                que a margem do pedido e parcial, e some-lo junto com a coluna
                seria esconder o motivo. */}
            {p.itens_fora_do_kpi > 0 && (
              <Badge tom="atencao">{p.itens_fora_do_kpi} fora do KPI</Badge>
            )}
          </span>
        ),
        titulo: (p) =>
          p.itens_fora_do_kpi > 0
            ? `${p.itens_fora_do_kpi} itens somam receita mas ficam fora do KPI de margem`
            : "",
      },
      {
        chave: "nota",
        rotulo: "Nota fiscal",
        celula: (p) => (
          <span className="num-tabular">
            {p.notas > 1
              ? `${inteiro(p.notas)} notas`
              : (rotuloNota(p.nota_fiscal, p.serie_nf) ?? "—")}
          </span>
        ),
      },
      {
        chave: "emissao",
        rotulo: "Emissão",
        celula: (p) => (p.emissao ? dataCurta(p.emissao) : "—"),
      },
      {
        chave: "cliente",
        rotulo: "Cliente",
        truncar: 240,
        titulo: (p) => p.nome_cliente ?? "",
        celula: (p) => p.nome_cliente ?? p.cod_cliente ?? "—",
      },
      { chave: null, rotulo: "Vendedor", celula: (p) => p.vendedor_nome ?? "—" },
      { chave: null, rotulo: "Canal", celula: (p) => p.canal },
      { chave: "quantidade", rotulo: "Qtd", num: true, celula: (p) => inteiro(p.quantidade) },
      { chave: "receita", rotulo: "Receita", num: true, celula: (p) => moeda(p.receita) },
      { chave: null, rotulo: "Custo", num: true, celula: (p) => moeda(p.custo) },
      {
        chave: "margem",
        rotulo: "Margem",
        num: true,
        negativo: (p) => numeroBruto(p.margem) < 0,
        celula: (p) => moeda(p.margem),
      },
      {
        chave: "margem_pct",
        rotulo: "Margem %",
        num: true,
        negativo: (p) => numeroBruto(p.margem_pct) < 0,
        celula: (p) => percentual(p.margem_pct),
      },
      {
        chave: null,
        rotulo: "Ações",
        acao: true,
        celula: (p) => (
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={
              <Link
                to={`${base}/${encodeURIComponent(p.chave)}${consulta ? `?${consulta}` : ""}`}
                aria-label={`Visualizar detalhes do pedido ${p.chave}`}
              />
            }
          >
            <EyeIcon data-icon="inline-start" />
            Ver pedido
          </Button>
        ),
      },
    ],
    [base, consulta],
  );

  const rotulo = porArmazem
    ? (data?.pedidos[0]?.armazem_rotulo ?? armazem)
    : (data?.pedidos[0]?.vendedor_nome ?? vendedor);

  return (
    <>
      <CabecalhoPagina
        titulo={`Pedidos faturados — ${rotulo}`}
        descricao="Acompanhe o faturamento realizado, a cobertura do indicador de margem e os pedidos que exigem revisão."
        voltar={
          <Button
            variant="link"
            size="sm"
            nativeButton={false}
            className="mb-1 h-auto p-0"
            render={
              <Link
                to={`/${porArmazem ? "armazens" : "vendedores"}${consulta ? `?${consulta}` : ""}`}
              />
            }
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Voltar para {porArmazem ? "Por armazém" : "Por vendedor"}
          </Button>
        }
        contexto={<><Badge tom="info">Faturado</Badge><Badge>{porArmazem ? "Recorte por armazém" : "Recorte por vendedor"}</Badge></>}
      />

      <BarraFiltros
        valor={filtros}
        aoMudar={(novos) => {
          setOffset(0);
          setFiltros(novos);
        }}
        ocultarArmazem={porArmazem}
        ocultarCanal={!porArmazem}
      />

      {isError && <Erro mensagem={(error as Error).message} />}

      {isPending && (
        <>
          <SkeletonTiles quantidade={4} />
          <SkeletonTabela linhas={10} colunas={12} />
        </>
      )}

      {data && data.total === 0 && (
        <Vazio mensagem="Nenhum pedido faturado para os filtros selecionados." />
      )}

      {data && data.total > 0 && (
        <>
          <Resumo resumo={data.resumo} />

          <Abas
            valor={aba}
            aoMudar={setAba}
            opcoes={[
              { valor: "gerencial", rotulo: "Visão gerencial" },
              { valor: "detalhamento", rotulo: "Detalhamento", contador: data.total },
            ]}
          />

          {aba === "gerencial" && (
            <Secao
              titulo="Qualidade do faturamento"
              nota="Indicadores calculados sobre todos os pedidos do recorte, não apenas sobre a página atual."
            >
              <BarraComposicao
                valor={
                  numeroBruto(data.resumo.receita)
                    ? numeroBruto(data.resumo.receita_no_kpi) /
                      numeroBruto(data.resumo.receita)
                    : 0
                }
                rotulo="Receita coberta pelo KPI de margem"
                detalhe={percentual(
                  numeroBruto(data.resumo.receita)
                    ? numeroBruto(data.resumo.receita_no_kpi) /
                        numeroBruto(data.resumo.receita)
                    : null,
                )}
                tom="bom"
              />

              <GradeInsights>
                <PainelInsight
                  titulo="Volume faturado"
                  valor={inteiro(data.resumo.pedidos)}
                  texto={`${inteiro(data.resumo.notas)} notas fiscais emitidas`}
                />
                <PainelInsight
                  titulo="Diversidade"
                  valor={inteiro(data.resumo.skus)}
                  texto={`${inteiro(data.resumo.itens)} itens faturados`}
                />
                <PainelInsight
                  titulo="Fora do indicador"
                  valor={inteiro(data.resumo.itens_fora_do_kpi)}
                  texto="Itens com custo não confiável, outlier ou saída que não é venda"
                  tom={data.resumo.itens_fora_do_kpi ? "atencao" : "bom"}
                />
              </GradeInsights>

              <Nota>
                A receita faturada inclui todas as linhas da nota. A receita no
                indicador exclui itens sem custo confiável, outliers e tipos de saída
                que não representam venda.
              </Nota>
            </Secao>
          )}

          {aba === "detalhamento" && (
            <Secao
              titulo="Pedidos faturados"
              nota="Ordene as colunas ou abra um pedido para auditar sua composição."
            >
              <Tabela
                linhas={data.pedidos}
                colunas={colunas}
                chaveLinha={(p) => p.chave}
                rotuloAcessivel="Pedidos faturados"
                ordenacao={{
                  valor: ordenar,
                  aoMudar: (valor) => {
                    setOffset(0);
                    setOrdenar(valor);
                  },
                }}
                paginacao={{
                  modo: "servidor",
                  total: data.total,
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
      )}
    </>
  );
}
