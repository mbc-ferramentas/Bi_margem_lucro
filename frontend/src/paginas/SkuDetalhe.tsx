/** Um SKU, aberto em pedidos, notas, vendedores e suprimentos.
 *
 *  A tela `Por SKU` responde *quanto* um item deu de margem; esta responde *onde*
 *  ela foi feita — em quais pedidos e notas o item saiu, para quem, por qual
 *  vendedor e a que custo.
 *
 *  Diferenca importante em relacao a lista: ela le a agregada `mv_margem_sku`,
 *  que ja nasce sem as linhas sem custo e sem os outliers; aqui a leitura e
 *  `mv_margem_item` inteira. Esconder essas linhas seria esconder justamente o
 *  pedido que o usuario veio investigar — entao elas aparecem marcadas, e a nota
 *  de rodape explica por que os totais podem nao bater com a linha da lista.
 */

import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useSku } from "../api/hooks";
import type { PedidoDoSku } from "../api/tipos";
import { IconeOlho } from "../componentes/Icones";
import { AvisoMarketplace, Erro, Vazio } from "../componentes/Layout";
import { Paginacao } from "../componentes/Paginacao";
import { SeletorTema } from "../componentes/SeletorTema";
import { SkeletonTabela } from "../componentes/Skeleton";
import { escreverFiltros, useFiltrosUrl } from "../filtrosUrl";
import {
  competencia,
  dataCurta,
  inteiro,
  moeda,
  numeroBruto,
  percentual,
  rotuloNota,
} from "../formato";

/** Rotulo de cada degrau da cascata de custo (Regra 3) — o mesmo mapa que o
 *  detalhe do pedido usa: e ele que explica quase toda margem fora do esperado. */
const ORIGEM_CUSTO: Record<string, string> = {
  saida: "Saída",
  medio: "Custo do Cadastro",
  ultima_compra: "valor Ult.Compra",
  outro_armazem: "Mesmo SKU em outro armazém",
};

const COLUNAS = [
  { chave: "pedido", rotulo: "Pedido", num: false },
  { chave: "nota", rotulo: "Nota", num: false },
  { chave: "emissao", rotulo: "Emissão", num: false },
  { chave: "cliente", rotulo: "Cliente", num: false },
  { chave: null, rotulo: "Canal", num: false },
  { chave: null, rotulo: "Vendedor", num: false },
  { chave: null, rotulo: "Armazém", num: false },
  { chave: "quantidade", rotulo: "Qtd", num: true },
  { chave: null, rotulo: "Unitário", num: true },
  { chave: "receita", rotulo: "Receita", num: true },
  { chave: null, rotulo: "Custo unit.", num: false },
  { chave: null, rotulo: "Origem do custo", num: false },
  { chave: "margem", rotulo: "Margem", num: true },
  { chave: "margem_pct", rotulo: "Margem %", num: true },
  { chave: null, rotulo: "Ações", num: false },
] as const;

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="campo-leitura">
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
    </div>
  );
}

/** Por que esta linha nao entra no KPI de margem. Vazio = ela entra. */
function motivosForaDoKpi(linha: PedidoDoSku): string[] {
  const motivos: string[] = [];
  if (linha.sem_custo) motivos.push("sem custo");
  if (linha.outlier_custo) motivos.push("outlier de custo");
  if (!linha.tes_receita) motivos.push("TES não-venda");
  return motivos;
}

export function SkuDetalhe() {
  const { sku = "" } = useParams();
  const [filtros] = useFiltrosUrl();
  const consulta = escreverFiltros(filtros);
  const voltar = `/skus${consulta ? `?${consulta}` : ""}`;

  const [ordenar, setOrdenar] = useState("-emissao");
  const [offset, setOffset] = useState(0);
  const [itensPorPagina, setItensPorPagina] = useState(25);

  const { data, isPending, isError, error } = useSku(
    sku,
    filtros,
    ordenar,
    offset,
    itensPorPagina,
  );

  function ordenarPor(chave: string | null) {
    if (!chave) return;
    setOffset(0);
    setOrdenar((atual) => (atual === `-${chave}` ? chave : `-${chave}`));
  }

  const cabecalho = data?.sku;

  return (
    <>
      <div className="cabecalho">
        <div>
          <Link className="voltar" to={voltar}>
            ← Voltar para os SKUs
          </Link>
          <h1>{sku}</h1>
          <p className="subtitulo">
            {cabecalho?.descricao ??
              "Pedidos, notas e vendedores em que este item aparece."}
          </p>
        </div>
        <SeletorTema />
      </div>

      {isError && <Erro mensagem={(error as Error).message} />}
      {isPending && <SkeletonTabela linhas={8} colunas={15} />}

      {data && cabecalho && (
        <>
          {cabecalho.canais.some((c) => c.toLowerCase().includes("marketplace")) && (
            <AvisoMarketplace texto={data.escopo.aviso_marketplace} />
          )}

          <div className="cartao">
            <h2>Item</h2>
            <div className="grade-leitura">
              <Campo rotulo="Descrição" valor={cabecalho.descricao ?? "—"} />
              <Campo
                rotulo="Grupo"
                valor={`${cabecalho.grupo_rotulo ?? cabecalho.grupo_codigo ?? "—"}${
                  cabecalho.grupo_reclassificado ? " (reclassificado)" : ""
                }`}
              />
              <Campo
                rotulo="Armazéns"
                valor={cabecalho.armazens.length ? cabecalho.armazens.join(", ") : "—"}
              />
              <Campo
                rotulo="Canais"
                valor={cabecalho.canais.length ? cabecalho.canais.join(", ") : "—"}
              />
              <Campo rotulo="Pedidos" valor={inteiro(cabecalho.pedidos)} />
              <Campo rotulo="Notas fiscais" valor={inteiro(cabecalho.notas)} />
              <Campo rotulo="Clientes" valor={inteiro(cabecalho.clientes)} />
              <Campo
                rotulo="Primeira venda"
                valor={
                  cabecalho.primeira_venda ? dataCurta(cabecalho.primeira_venda) : "—"
                }
              />
              <Campo
                rotulo="Última venda"
                valor={cabecalho.ultima_venda ? dataCurta(cabecalho.ultima_venda) : "—"}
              />
            </div>

            <h2 style={{ marginTop: 18 }}>Totais</h2>
            <div className="grade-leitura">
              <Campo rotulo="Quantidade" valor={inteiro(cabecalho.quantidade)} />
              <Campo rotulo="Receita cheia" valor={moeda(cabecalho.receita)} />
              <Campo rotulo="Desconto" valor={moeda(cabecalho.desconto)} />
              <Campo rotulo="Receita líquida" valor={moeda(cabecalho.receita_liquida)} />
              <Campo rotulo="Custo" valor={moeda(cabecalho.custo)} />
              <Campo rotulo="Preço médio" valor={moeda(cabecalho.preco_medio)} />
              <Campo rotulo="Custo médio" valor={moeda(cabecalho.custo_medio)} />
              <Campo
                rotulo="Margem bruta"
                valor={`${moeda(cabecalho.margem)} · ${percentual(cabecalho.margem_pct)}`}
              />
              <Campo
                rotulo="Margem líquida"
                valor={`${moeda(cabecalho.margem_liquida)} · ${percentual(
                  cabecalho.margem_liquida_pct,
                )}`}
              />
            </div>

            {cabecalho.itens_fora_do_kpi > 0 && (
              <p className="nota">
                {inteiro(cabecalho.itens_fora_do_kpi)} de {inteiro(cabecalho.linhas)}{" "}
                linhas somam receita mas ficam fora do indicador de margem — os
                percentuais acima são calculados só sobre as restantes. A tela{" "}
                <em>Por SKU</em> já exclui essas linhas do total, então os números
                aqui podem ser maiores que os de lá.
              </p>
            )}
            {cabecalho.linhas_fora_do_recorte > 0 && (
              <p className="nota">
                Este SKU tem mais {inteiro(cabecalho.linhas_fora_do_recorte)} linhas
                fora do filtro atual (outro armazém, outro canal ou outra
                competência). Os totais aqui são só do recorte que você está vendo.
              </p>
            )}
          </div>

          {data.suprimentos_visiveis && (
            <div className="cartao" style={{ marginTop: 14 }}>
              <h2>Estoque</h2>
              <p className="nota">
                Último snapshot do SB2. O valor da última compra vem do cadastro e
                não tem data — a data real está nas notas de entrada abaixo.
              </p>
              {data.estoque.length === 0 ? (
                <Vazio mensagem="Item sem posição de estoque no último SB2 carregado." />
              ) : (
                <div className="rolagem">
                  <table>
                    <thead>
                      <tr>
                        <th>Armazém</th>
                        <th className="num">Saldo atual</th>
                        <th className="num">Saldo disponível</th>
                        <th className="num">Custo unit.</th>
                        <th className="num">Últ. compra (valor)</th>
                        <th>Snapshot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.estoque.map((e) => (
                        <tr key={`${e.armazem}`}>
                          <td>{e.armazem_rotulo ?? e.armazem ?? "—"}</td>
                          <td className="num">{inteiro(e.saldo_atual)}</td>
                          <td className="num">{inteiro(e.saldo_disponivel)}</td>
                          <td className="num">{moeda(e.custo_unitario)}</td>
                          <td className="num">{moeda(e.vlr_ult_compra)}</td>
                          <td>{e.dt_carga ? dataCurta(e.dt_carga) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h2 style={{ marginTop: 18 }}>Últimas compras</h2>
              <p className="nota">
                Notas de entrada (SD1, tipo N). O Protheus exporta só o código do
                fornecedor, não o nome.
              </p>
              {data.compras.length === 0 ? (
                <Vazio mensagem="Sem nota de entrada para este item no período carregado do SD1." />
              ) : (
                <div className="rolagem">
                  <table>
                    <thead>
                      <tr>
                        <th>Emissão</th>
                        <th>Documento</th>
                        <th>Fornecedor</th>
                        <th>Armazém</th>
                        <th className="num">Qtd</th>
                        <th className="num">Unitário</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.compras.map((c, i) => (
                        <tr key={`${c.documento}-${c.serie}-${c.armazem}-${i}`}>
                          <td>{c.dt_emissao ? dataCurta(c.dt_emissao) : "—"}</td>
                          <td style={{ fontVariantNumeric: "tabular-nums" }}>
                            {rotuloNota(c.documento, c.serie) ?? "—"}
                          </td>
                          <td>
                            {c.forn_cliente
                              ? `${c.forn_cliente}${c.loja ? `/${c.loja}` : ""}`
                              : "—"}
                          </td>
                          <td>{c.armazem ?? "—"}</td>
                          <td className="num">{inteiro(c.quantidade)}</td>
                          <td className="num">{moeda(c.vlr_unitario)}</td>
                          <td className="num">{moeda(c.custo_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="cartao" style={{ marginTop: 14 }}>
            <h2>Vendedores</h2>
            <p className="nota">
              Quem vendeu o item no recorte. Não é ranking de vendedor: o
              Marketplace (código 72) é o integrador Lexos, não uma pessoa, e
              aparece aqui como “sem vendedor”.
            </p>
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th className="num">Pedidos</th>
                    <th className="num">Qtd</th>
                    <th className="num">Receita</th>
                    <th className="num">Margem</th>
                    <th className="num">Margem %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vendedores.map((v) => (
                    <tr key={v.vendedor_codigo ?? "sem-vendedor"}>
                      <td>
                        {v.vendedor_nome ??
                          (v.vendedor_codigo
                            ? v.vendedor_codigo
                            : "sem vendedor (marketplace)")}
                      </td>
                      <td className="num">{inteiro(v.pedidos)}</td>
                      <td className="num">{inteiro(v.quantidade)}</td>
                      <td className="num">{moeda(v.receita)}</td>
                      <td
                        className={numeroBruto(v.margem) < 0 ? "num negativo" : "num"}
                      >
                        {moeda(v.margem)}
                      </td>
                      <td
                        className={
                          numeroBruto(v.margem_pct) < 0 ? "num negativo" : "num"
                        }
                      >
                        {percentual(v.margem_pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="cartao" style={{ marginTop: 14 }}>
            <div className="cabecalho">
              <div>
                <h2>{inteiro(data.total)} pedidos e notas</h2>
                <p className="nota">
                  Uma linha por pedido e nota fiscal — o mesmo pedido pode faturar em
                  mais de uma. Clique no cabeçalho para ordenar.
                </p>
              </div>
            </div>

            {data.pedidos.length === 0 ? (
              <Vazio mensagem="Nenhum pedido no período e filtros selecionados." />
            ) : (
              <>
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
                      {data.pedidos.map((p) => {
                        const motivos = motivosForaDoKpi(p);
                        return (
                          <tr key={`${p.chave}-${p.serie_nf}-${p.nota_fiscal}`}>
                            <td style={{ fontVariantNumeric: "tabular-nums" }}>
                              {p.origem === "pdv" ? "Balcão (PDV)" : p.num_pedido}
                              {motivos.length > 0 && (
                                <span
                                  className="marcador alerta"
                                  title="Soma na receita, fora do KPI de margem"
                                >
                                  {motivos.join(" · ")}
                                </span>
                              )}
                            </td>
                            <td style={{ fontVariantNumeric: "tabular-nums" }}>
                              {rotuloNota(p.nota_fiscal, p.serie_nf) ?? "—"}
                            </td>
                            <td>
                              {p.emissao
                                ? dataCurta(p.emissao)
                                : p.competencia
                                  ? competencia(p.competencia)
                                  : "—"}
                            </td>
                            <td
                              style={{
                                maxWidth: 240,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                              title={p.nome_cliente ?? ""}
                            >
                              {p.nome_cliente ?? p.cod_cliente ?? "—"}
                            </td>
                            <td>{p.canal}</td>
                            <td>{p.vendedor_nome ?? "—"}</td>
                            <td>{p.armazem_rotulo ?? p.armazem ?? "—"}</td>
                            <td className="num">{inteiro(p.quantidade)}</td>
                            <td className="num">{moeda(p.vlr_unitario)}</td>
                            <td className="num">{moeda(p.receita_bruta)}</td>
                            <td className="num">{moeda(p.custo_unitario_ref)}</td>
                            <td>
                              {p.origem_custo
                                ? (ORIGEM_CUSTO[p.origem_custo] ?? p.origem_custo)
                                : "sem custo"}
                            </td>
                            <td
                              className={
                                numeroBruto(p.margem_bruta) < 0 ? "num negativo" : "num"
                              }
                            >
                              {p.sem_custo ? "—" : moeda(p.margem_bruta)}
                            </td>
                            <td
                              className={
                                numeroBruto(p.margem_pct) < 0 ? "num negativo" : "num"
                              }
                            >
                              {p.sem_custo ? "—" : percentual(p.margem_pct)}
                            </td>
                            <td className="acoes">
                              <Link
                                className="botao-alt acao-visualizar"
                                to={`/skus/${encodeURIComponent(
                                  sku,
                                )}/pedidos/${encodeURIComponent(p.chave)}${
                                  consulta ? `?${consulta}` : ""
                                }`}
                                aria-label={`Visualizar detalhes do pedido ${p.chave}`}
                              >
                                <IconeOlho />
                                Visualizar
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
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
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
