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

import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { usePedidos } from "../api/hooks";
import type { ResumoPedidos } from "../api/tipos";
import { BarraFiltros } from "../componentes/Filtros";
import { IconeOlho } from "../componentes/Icones";
import { Erro, Vazio } from "../componentes/Layout";
import { Paginacao } from "../componentes/Paginacao";
import { SeletorTema } from "../componentes/SeletorTema";
import { SkeletonTabela, SkeletonTiles } from "../componentes/Skeleton";
import { escreverFiltros, useFiltrosUrl } from "../filtrosUrl";
import { dataCurta, inteiro, moeda, numeroBruto, percentual, rotuloNota } from "../formato";

const COLUNAS = [
  { chave: "pedido", rotulo: "Pedido", num: false },
  { chave: "nota", rotulo: "Nota fiscal", num: false },
  { chave: "emissao", rotulo: "Emissão", num: false },
  { chave: "cliente", rotulo: "Cliente", num: false },
  { chave: null, rotulo: "Vendedor", num: false },
  { chave: null, rotulo: "Canal", num: false },
  { chave: "quantidade", rotulo: "Qtd", num: true },
  { chave: "receita", rotulo: "Receita", num: true },
  { chave: null, rotulo: "Custo", num: true },
  { chave: "margem", rotulo: "Margem", num: true },
  { chave: "margem_pct", rotulo: "Margem %", num: true },
  { chave: null, rotulo: "Ações", num: false },
] as const;

function Tile({ rotulo, valor, apoio }: { rotulo: string; valor: string; apoio?: string }) {
  return (
    <div className="cartao tile">
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
      {apoio && <div className="apoio">{apoio}</div>}
    </div>
  );
}

function Resumo({ resumo }: { resumo: ResumoPedidos }) {
  return (
    <div className="grade-tiles">
      <Tile
        rotulo="Receita faturada"
        valor={moeda(resumo.receita)}
        apoio={`${inteiro(resumo.itens)} itens · ${inteiro(
          resumo.pedidos,
        )} pedidos · ${inteiro(resumo.notas)} notas`}
      />
      <Tile
        rotulo="Receita no indicador"
        valor={moeda(resumo.receita_no_kpi)}
        apoio={
          resumo.itens_fora_do_kpi > 0
            ? `${inteiro(resumo.itens_fora_do_kpi)} itens fora do KPI de margem`
            : "Todos os itens entram no KPI"
        }
      />
      <Tile
        rotulo="Margem bruta"
        valor={moeda(resumo.margem)}
        apoio={`${percentual(resumo.margem_pct)} sobre a receita no indicador`}
      />
      <Tile
        rotulo="Ticket médio"
        valor={moeda(resumo.ticket_medio)}
        apoio={`${inteiro(resumo.skus)} SKUs distintos`}
      />
    </div>
  );
}

export function Pedidos() {
  // A dimensão de origem vem da rota, não do filtro: a URL é que diz qual tela
  // é esta. Por isso a barra esconde o select correspondente — duas verdades
  // para o mesmo recorte seria pior que uma trava.
  const { armazem = "", vendedor = "" } = useParams();
  const porArmazem = Boolean(armazem);
  const [filtros, setFiltros] = useFiltrosUrl();
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

  function ordenarPor(chave: string | null) {
    if (!chave) return;
    setOffset(0);
    setOrdenar((atual) => (atual === `-${chave}` ? chave : `-${chave}`));
  }

  const rotulo = porArmazem
    ? (data?.pedidos[0]?.armazem_rotulo ?? armazem)
    : (data?.pedidos[0]?.vendedor_nome ?? vendedor);

  return (
    <>
      <div className="cabecalho">
        <div>
          <Link
            className="voltar"
            to={`/${porArmazem ? "armazens" : "vendedores"}${consulta ? `?${consulta}` : ""}`}
          >
            ← Voltar para {porArmazem ? "Por armazém" : "Por vendedor"}
          </Link>
          <h1>Pedidos faturados — {rotulo}</h1>
          <p className="subtitulo">
            Cada linha é um pedido que já virou nota fiscal (SD2). Clique num pedido
            para ver os itens, o custo de cada um e por que a margem ficou nesse
            patamar.
          </p>
        </div>
        <SeletorTema />
      </div>

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
        <div className="cartao">
          <Resumo resumo={data.resumo} />

          <p className="nota">
            A receita faturada inclui linhas que ficam fora do KPI de margem (sem
            custo confiável, outlier de custo ou tipo de saída que não é venda).
            Elas continuam sendo faturamento e por isso continuam aqui — é a
            &ldquo;receita no indicador&rdquo; que fecha com a tela Por armazém.
          </p>

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
                {data.pedidos.map((pedido) => (
                  <tr key={pedido.chave}>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>
                      {pedido.origem === "pdv" ? "Balcão/PDV" : pedido.chave}
                      {pedido.armazens > 1 && (
                        <span
                          className="marcador"
                          title="Este pedido também sai por outro armazém"
                        >
                          {pedido.armazens} armazéns
                        </span>
                      )}
                      {/* O marcador veio para cá com o fim da coluna Itens: ele
                          explica por que a margem do pedido é parcial, e some-lo
                          junto com a coluna seria esconder o motivo. */}
                      {pedido.itens_fora_do_kpi > 0 && (
                        <span
                          className="marcador alerta"
                          title={`${pedido.itens_fora_do_kpi} itens somam receita mas ficam fora do KPI de margem`}
                        >
                          {pedido.itens_fora_do_kpi} fora do KPI
                        </span>
                      )}
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>
                      {pedido.notas > 1
                        ? `${inteiro(pedido.notas)} notas`
                        : (rotuloNota(pedido.nota_fiscal, pedido.serie_nf) ?? "—")}
                    </td>
                    <td>{pedido.emissao ? dataCurta(pedido.emissao) : "—"}</td>
                    <td
                      style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}
                      title={pedido.nome_cliente ?? ""}
                    >
                      {pedido.nome_cliente ?? pedido.cod_cliente ?? "—"}
                    </td>
                    <td>{pedido.vendedor_nome ?? "—"}</td>
                    <td>{pedido.canal}</td>
                    <td className="num">{inteiro(pedido.quantidade)}</td>
                    <td className="num">{moeda(pedido.receita)}</td>
                    <td className="num">{moeda(pedido.custo)}</td>
                    <td className={numeroBruto(pedido.margem) < 0 ? "num negativo" : "num"}>
                      {moeda(pedido.margem)}
                    </td>
                    <td
                      className={
                        numeroBruto(pedido.margem_pct) < 0 ? "num negativo" : "num"
                      }
                    >
                      {percentual(pedido.margem_pct)}
                    </td>
                    <td className="acoes">
                      <Link
                        className="botao-alt acao-visualizar"
                        to={`${base}/${encodeURIComponent(pedido.chave)}${
                          consulta ? `?${consulta}` : ""
                        }`}
                        aria-label={`Visualizar detalhes do pedido ${pedido.chave}`}
                      >
                        <IconeOlho />
                        Visualizar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Paginacao
            total={data.total}
            offset={offset}
            itensPorPagina={itensPorPagina}
            aoMudarOffset={setOffset}
            aoMudarItensPorPagina={(quantidade) => {
              setOffset(0);
              setItensPorPagina(quantidade);
            }}
          />
        </div>
      )}
    </>
  );
}
