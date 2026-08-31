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

import { Link, useParams } from "react-router-dom";

import { usePedido } from "../api/hooks";
import type { ItemPedido } from "../api/tipos";
import { AvisoMarketplace, Erro } from "../componentes/Layout";
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
  // Chega-se aqui por dois caminhos (armazém ou vendedor). Quem travou o
  // recorte lá em cima é quem manda no recorte daqui e no destino do Voltar.
  const { armazem = "", vendedor = "", chave = "" } = useParams();
  const porArmazem = Boolean(armazem);
  const [filtros] = useFiltrosUrl();
  const consulta = escreverFiltros(filtros);
  const base = porArmazem
    ? `/armazens/${armazem}/pedidos`
    : `/vendedores/${encodeURIComponent(vendedor)}/pedidos`;
  const voltar = `${base}${consulta ? `?${consulta}` : ""}`;

  const { data, isPending, isError, error } = usePedido(chave, {
    ...filtros,
    ...(porArmazem ? { armazem } : { vendedor }),
  });

  const cabecalho = data?.pedido;

  return (
    <>
      <div className="cabecalho">
        <div>
          <Link className="voltar" to={voltar}>
            ← Voltar para os pedidos
          </Link>
          <h1>
            {cabecalho?.origem === "pdv"
              ? "Venda de balcão (PDV)"
              : `Pedido ${cabecalho?.num_pedido ?? chave}`}
          </h1>
          <p className="subtitulo">
            {cabecalho?.origem === "pdv"
              ? "O export de balcão não traz número de documento: cada linha é uma venda própria."
              : "Itens faturados do pedido, com o custo que produziu cada margem."}
          </p>
        </div>
        <SeletorTema />
      </div>

      {isError && <Erro mensagem={(error as Error).message} />}
      {isPending && <SkeletonTabela linhas={6} colunas={13} />}

      {data && cabecalho && (
        <>
          {cabecalho.canal.toLowerCase().includes("marketplace") && (
            <AvisoMarketplace texto={data.escopo.aviso_marketplace} />
          )}

          <div className="cartao">
            <h2>Pedido</h2>
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
              <Campo
                rotulo={cabecalho.notas.length > 1 ? "Notas fiscais" : "Nota fiscal"}
                valor={
                  cabecalho.notas.length
                    ? cabecalho.notas
                        .map((n) => rotuloNota(n.nota_fiscal, n.serie_nf))
                        .join(", ")
                    : "—"
                }
              />
              <Campo
                rotulo="Emissão"
                valor={cabecalho.emissao ? dataCurta(cabecalho.emissao) : "—"}
              />
              <Campo
                rotulo="Competência"
                valor={cabecalho.competencia ? competencia(cabecalho.competencia) : "—"}
              />
            </div>

            <h2 style={{ marginTop: 18 }}>Totais</h2>
            <div className="grade-leitura">
              <Campo rotulo="Receita cheia" valor={moeda(cabecalho.receita)} />
              <Campo rotulo="Desconto" valor={moeda(cabecalho.desconto)} />
              <Campo rotulo="Receita líquida" valor={moeda(cabecalho.receita_liquida)} />
              <Campo rotulo="Custo" valor={moeda(cabecalho.custo)} />
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
          </div>

          <div className="cartao" style={{ marginTop: 14 }}>
            <h2>Itens</h2>
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
                  {data.itens.map((item) => {
                    const motivos = motivosForaDoKpi(item);
                    return (
                      <tr key={item.id}>
                        <td style={{ fontVariantNumeric: "tabular-nums" }}>
                          {rotuloNota(item.nota_fiscal, item.serie_nf) ?? "—"}
                        </td>
                        <td style={{ fontVariantNumeric: "tabular-nums" }}>
                          {item.sku}
                          {motivos.length > 0 && (
                            <span
                              className="marcador alerta"
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
                            <span className="marcador" title="Grupo definido por reclassificação manual">
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
          </div>
        </>
      )}
    </>
  );
}
