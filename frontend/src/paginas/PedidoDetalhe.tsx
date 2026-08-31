/** Um pedido faturado, item a item.
 *
 *  É o fundo do drill-down: aqui a margem deixa de ser um agregado e vira a conta
 *  de cada linha da nota. Por isso a tela mostra a **origem do custo** (a cascata
 *  da Regra 3) e marca as linhas que ficam fora do KPI — quase toda margem
 *  estranha se explica por uma dessas duas coisas.
 *
 *  Receita cheia e líquida aparecem lado a lado porque o Protheus registra o
 *  desconto à parte: `Vlr.Total` continua sendo quantidade × unitário.
 */

import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { usePedido } from "../api/hooks";
import type { ItemPedido } from "../api/tipos";
import { AvisoMarketplace, Erro } from "../componentes/Layout";
import { SkeletonTabela } from "../componentes/Skeleton";
import { Abas, Badge, CabecalhoPagina, CartaoKpi } from "../componentes/Visual";
import { escreverFiltros, useAbaUrl, useFiltrosUrl } from "../filtrosUrl";
import {
  competencia,
  dataCurta,
  inteiro,
  moeda,
  numeroBruto,
  percentual,
  rotuloNota,
} from "../formato";

/** Rótulo de cada degrau da cascata de custo (Regra 3). O código cru não diz nada
 *  para quem lê a tela, e a diferença entre 'saida' e 'ultima_compra' é
 *  exatamente o que explica uma margem fora do esperado. */
const ORIGEM_CUSTO: Record<string, string> = {
  saida: "Saída", 
  medio: "Custo do Cadastro",
  ultima_compra: "valor Ult.Compra",
  outro_armazem: "Mesmo SKU em outro armazém",
};

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="campo-leitura">
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
    </div>
  );
}

/** Por que esta linha não entra no KPI de margem. Vazio = ela entra. */
function motivosForaDoKpi(item: ItemPedido): string[] {
  const motivos: string[] = [];
  if (item.sem_custo) motivos.push("sem custo");
  if (item.outlier_custo) motivos.push("outlier de custo");
  if (!item.tes_receita) motivos.push("TES não-venda");
  return motivos;
}

export function PedidoDetalhe() {
  // Chega-se aqui por tres caminhos (armazém, vendedor ou SKU). Quem travou o
  // recorte lá em cima é quem manda no recorte daqui e no destino do Voltar.
  const { armazem = "", vendedor = "", sku = "", chave = "" } = useParams();
  const porSku = Boolean(sku);
  const porArmazem = Boolean(armazem);
  const [filtros] = useFiltrosUrl();
  const [aba, setAba] = useAbaUrl(["informacoes", "itens"] as const, "informacoes");
  const [filtroItens, setFiltroItens] = useState<"todos" | "fora_kpi" | "negativos" | "sem_custo">("todos");
  const consulta = escreverFiltros(filtros);
  // Vindo do SKU o destino é a própria tela do item, não uma lista de pedidos.
  const base = porSku
    ? `/skus/${encodeURIComponent(sku)}`
    : porArmazem
      ? `/armazens/${armazem}/pedidos`
      : `/vendedores/${encodeURIComponent(vendedor)}/pedidos`;
  const voltar = `${base}${consulta ? `?${consulta}` : ""}`;

  // `sku` não é dimensão de filtro: o pedido é mostrado inteiro de propósito, e
  // `linhas_fora_do_recorte` já explica o que o filtro de tela deixou de fora.
  const { data, isPending, isError, error } = usePedido(chave, {
    ...filtros,
    ...(porSku ? {} : porArmazem ? { armazem } : { vendedor }),
  });

  const cabecalho = data?.pedido;
  const itensVisiveis = data?.itens.filter((item) => {
    if (filtroItens === "fora_kpi") return motivosForaDoKpi(item).length > 0;
    if (filtroItens === "negativos") return !item.sem_custo && numeroBruto(item.margem_bruta) < 0;
    if (filtroItens === "sem_custo") return item.sem_custo;
    return true;
  }) ?? [];

  return (
    <>
      <CabecalhoPagina
        titulo={cabecalho?.origem === "pdv" ? "Venda de balcão (PDV)" : `Pedido ${cabecalho?.num_pedido ?? chave}`}
        descricao={cabecalho?.origem === "pdv" ? "Venda individual do balcão com composição de receita, custo e margem." : "Resumo financeiro e rastreabilidade dos itens faturados."}
        voltar={<Link className="voltar" to={voltar}>{porSku ? "← Voltar para o SKU" : "← Voltar para os pedidos"}</Link>}
        contexto={cabecalho && <><Badge tom="info">{cabecalho.origem === "pdv" ? "PDV" : "Pedido faturado"}</Badge>{cabecalho.canal.toLowerCase().includes("marketplace") && <Badge tom="atencao">Marketplace</Badge>}</>}
      />

      {isError && <Erro mensagem={(error as Error).message} />}
      {isPending && <SkeletonTabela linhas={6} colunas={13} />}

      {data && cabecalho && (
        <>
          {cabecalho.canal.toLowerCase().includes("marketplace") && (
            <AvisoMarketplace texto={data.escopo.aviso_marketplace} />
          )}

          <div className="grade-kpis">
            <CartaoKpi rotulo="Receita líquida" valor={moeda(cabecalho.receita_liquida)} apoio={`${moeda(cabecalho.desconto)} em descontos`} />
            <CartaoKpi rotulo="Custo" valor={moeda(cabecalho.custo)} apoio="Custo considerado no pedido" />
            <CartaoKpi rotulo="Margem bruta" valor={moeda(cabecalho.margem)} apoio={percentual(cabecalho.margem_pct)} tom={numeroBruto(cabecalho.margem) < 0 ? "critico" : "bom"} />
            <CartaoKpi rotulo="Itens fora do KPI" valor={inteiro(cabecalho.itens_fora_do_kpi)} apoio={`de ${inteiro(cabecalho.itens)} itens`} tom={cabecalho.itens_fora_do_kpi ? "atencao" : "bom"} />
          </div>

          <div className="cartao" style={{ marginBottom: 14 }}>
            <h2>Formação da margem após desconto</h2>
            <div className="formula-financeira">
              <div className="formula-item"><span>Receita bruta</span><strong>{moeda(cabecalho.receita)}</strong></div><span className="formula-operador">−</span>
              <div className="formula-item"><span>Desconto</span><strong>{moeda(cabecalho.desconto)}</strong></div><span className="formula-operador">−</span>
              <div className="formula-item"><span>Custo</span><strong>{moeda(cabecalho.custo)}</strong></div><span className="formula-operador">=</span>
              <div className="formula-item"><span>Margem líquida</span><strong>{moeda(cabecalho.margem_liquida)}</strong></div>
            </div>
            <p className="nota">A margem bruta antes do desconto é {moeda(cabecalho.margem)}. Após o desconto, a margem líquida é {moeda(cabecalho.margem_liquida)} ({percentual(cabecalho.margem_liquida_pct)}).</p>
          </div>

          <Abas valor={aba} aoMudar={setAba} opcoes={[{ valor: "informacoes", rotulo: "Informações" }, { valor: "itens", rotulo: "Itens", contador: data.itens.length }]} />

          {aba === "informacoes" && <div className="cartao">
            <h2>Informações comerciais</h2>
            <div className="grade-leitura">
              <Campo
                rotulo="Cliente"
                valor={
                  cabecalho.nome_cliente
                    ? `${cabecalho.cod_cliente ?? "—"} · ${cabecalho.nome_cliente}`
                    : (cabecalho.cod_cliente ?? "—")
                }
              />
              <Campo rotulo="Vendedor" valor={cabecalho.vendedor_nome ?? "—"} />
              <Campo rotulo="Canal" valor={cabecalho.canal} />
              <Campo
                rotulo="Armazém"
                valor={cabecalho.armazens.length ? cabecalho.armazens.join(", ") : "—"}
              />
            </div>

            <h2 style={{ marginTop: 18 }}>Informações fiscais</h2>
            <div className="grade-leitura">
              <Campo rotulo={cabecalho.notas.length > 1 ? "Notas fiscais" : "Nota fiscal"} valor={cabecalho.notas.length ? cabecalho.notas.map((n) => rotuloNota(n.nota_fiscal, n.serie_nf)).join(", ") : "—"} />
              <Campo rotulo="Emissão" valor={cabecalho.emissao ? dataCurta(cabecalho.emissao) : "—"} />
              <Campo rotulo="Competência" valor={cabecalho.competencia ? competencia(cabecalho.competencia) : "—"} />
            </div>

            {cabecalho.itens_fora_do_kpi > 0 && (
              <p className="nota">
                {inteiro(cabecalho.itens_fora_do_kpi)} de {inteiro(cabecalho.itens)}{" "}
                itens somam receita mas ficam fora do indicador de margem — os
                percentuais acima são calculados só sobre os itens restantes.
              </p>
            )}
            {cabecalho.linhas_fora_do_recorte > 0 && (
              <p className="nota">
                Este pedido tem mais {inteiro(cabecalho.linhas_fora_do_recorte)} linhas
                fora do filtro atual (outro armazém, outro vendedor ou outra
                competência). Os totais aqui são só do recorte que você está vendo.
              </p>
            )}
          </div>}

          {aba === "itens" && <div className="cartao">
            <div className="secao-topo"><div><h2>Itens faturados</h2><p className="nota">Os filtros abaixo não alteram os totais do pedido.</p></div><div className="segmented" aria-label="Filtrar itens">{([['todos','Todos'],['fora_kpi','Fora do KPI'],['negativos','Margem negativa'],['sem_custo','Sem custo']] as const).map(([valor, rotulo]) => <button key={valor} aria-pressed={filtroItens === valor} onClick={() => setFiltroItens(valor)}>{rotulo}</button>)}</div></div>
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Nota</th>
                    <th>SKU</th>
                    <th>Descrição</th>
                    <th>Grupo</th>
                    <th>Armazém</th>
                    <th className="num">Qtd</th>
                    <th className="num">Unitário</th>
                    <th className="num">Desconto</th>
                    <th className="num">Receita</th>
                    <th className="num">Custo unit.</th>
                    <th>Origem do custo</th>
                    <th className="num">Margem</th>
                    <th className="num">Margem %</th>
                  </tr>
                </thead>
                <tbody>
                  {itensVisiveis.map((item) => {
                    const motivos = motivosForaDoKpi(item);
                    return (
                      <tr key={item.id}>
                        <td className="tabela-identidade" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {rotuloNota(item.nota_fiscal, item.serie_nf) ?? "—"}
                        </td>
                        <td style={{ fontVariantNumeric: "tabular-nums" }}>
                          {item.sku}
                          {motivos.length > 0 && (
                            <span
                              className="badge badge-atencao"
                              title="Soma na receita, fora do KPI de margem"
                            >
                              {motivos.join(" · ")}
                            </span>
                          )}
                        </td>
                        <td
                          style={{
                            maxWidth: 280,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={item.descricao ?? ""}
                        >
                          {item.descricao ?? "—"}
                        </td>
                        <td>
                          {item.grupo_rotulo ?? item.grupo_codigo ?? "—"}
                          {item.grupo_reclassificado && (
                            <span className="badge" title="Grupo definido por reclassificação manual">
                              reclassificado
                            </span>
                          )}
                        </td>
                        <td>{item.armazem_rotulo ?? item.armazem ?? "—"}</td>
                        <td className="num">{inteiro(item.quantidade)}</td>
                        <td className="num">{moeda(item.vlr_unitario)}</td>
                        <td className="num">{moeda(item.desconto)}</td>
                        <td className="num">{moeda(item.receita_bruta)}</td>
                        <td className="num">{moeda(item.custo_unitario_ref)}</td>
                        <td>
                          {item.origem_custo
                            ? (ORIGEM_CUSTO[item.origem_custo] ?? item.origem_custo)
                            : "sem custo"}
                        </td>
                        <td
                          className={
                            numeroBruto(item.margem_bruta) < 0 ? "num negativo" : "num"
                          }
                        >
                          {item.sem_custo ? "—" : moeda(item.margem_bruta)}
                        </td>
                        <td
                          className={
                            numeroBruto(item.margem_pct) < 0 ? "num negativo" : "num"
                          }
                        >
                          {item.sem_custo ? "—" : percentual(item.margem_pct)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>}
        </>
      )}
    </>
  );
}
