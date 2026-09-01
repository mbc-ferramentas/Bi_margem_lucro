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

import { ArrowLeftIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import { usePedido } from "../api/hooks";
import type { ItemPedido } from "../api/tipos";
import { Button } from "@/componentes/ui/button";
import { AvisoMarketplace, Erro } from "../componentes/Layout";
import { SkeletonTabela } from "../componentes/Skeleton";
import { Tabela, type Coluna } from "../componentes/Tabela";
import {
  Abas,
  Badge,
  CabecalhoPagina,
  CartaoKpi,
  GradeKpis,
  Nota,
  Secao,
  Segmentado,
} from "../componentes/Visual";
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

/** Par rotulo/valor. E leitura, nao formulario: nada aqui e editavel, entao
 *  nada aqui usa Input desabilitado — que so faria o dado parecer bloqueado. */
function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{rotulo}</div>
      <div className="mt-0.5 text-sm">{valor}</div>
    </div>
  );
}

function GradeLeitura({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2.5 grid gap-x-5 gap-y-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
      {children}
    </div>
  );
}

/** Uma parcela da formula receita − desconto − custo = margem liquida. */
function Parcela({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-[130px] rounded-lg bg-muted p-3">
      <span className="block text-[10.5px] tracking-wide text-muted-foreground uppercase">
        {rotulo}
      </span>
      <strong className="num-tabular mt-1 block text-[17px]">{valor}</strong>
    </div>
  );
}

function Operador({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-center text-xl text-muted-foreground max-md:h-4 max-md:rotate-90"
      aria-hidden="true"
    >
      {children}
    </span>
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
    ...(porSku ? {} : porArmazem ? { armazem: [armazem] } : { vendedor }),
  });

  const cabecalho = data?.pedido;
  const itensVisiveis = data?.itens.filter((item) => {
    if (filtroItens === "fora_kpi") return motivosForaDoKpi(item).length > 0;
    if (filtroItens === "negativos") return !item.sem_custo && numeroBruto(item.margem_bruta) < 0;
    if (filtroItens === "sem_custo") return item.sem_custo;
    return true;
  }) ?? [];

  const colunas: readonly Coluna<ItemPedido>[] = useMemo(
    () => [
      {
        chave: null,
        rotulo: "Nota",
        fixa: true,
        celula: (i) => (
          <span className="num-tabular">{rotuloNota(i.nota_fiscal, i.serie_nf) ?? "—"}</span>
        ),
      },
      {
        chave: null,
        rotulo: "SKU",
        celula: (i) => {
          const motivos = motivosForaDoKpi(i);
          return (
            <span className="num-tabular flex flex-wrap items-center gap-1.5">
              {i.sku}
              {motivos.length > 0 && <Badge tom="atencao">{motivos.join(" · ")}</Badge>}
            </span>
          );
        },
        titulo: (i) =>
          motivosForaDoKpi(i).length ? "Soma na receita, fora do KPI de margem" : "",
      },
      {
        chave: null,
        rotulo: "Descrição",
        truncar: 280,
        titulo: (i) => i.descricao ?? "",
        celula: (i) => i.descricao ?? "—",
      },
      {
        chave: null,
        rotulo: "Grupo",
        celula: (i) => (
          <span className="flex flex-wrap items-center gap-1.5">
            {i.grupo_rotulo ?? i.grupo_codigo ?? "—"}
            {i.grupo_reclassificado && <Badge>reclassificado</Badge>}
          </span>
        ),
        titulo: (i) =>
          i.grupo_reclassificado ? "Grupo definido por reclassificação manual" : "",
      },
      { chave: null, rotulo: "Armazém", celula: (i) => i.armazem_rotulo ?? i.armazem ?? "—" },
      { chave: null, rotulo: "Qtd", num: true, celula: (i) => inteiro(i.quantidade) },
      { chave: null, rotulo: "Unitário", num: true, celula: (i) => moeda(i.vlr_unitario) },
      { chave: null, rotulo: "Desconto", num: true, celula: (i) => moeda(i.desconto) },
      { chave: null, rotulo: "Receita", num: true, celula: (i) => moeda(i.receita_bruta) },
      {
        chave: null,
        rotulo: "Custo unit.",
        num: true,
        celula: (i) => moeda(i.custo_unitario_ref),
      },
      {
        chave: null,
        rotulo: "Origem do custo",
        celula: (i) =>
          i.origem_custo ? (ORIGEM_CUSTO[i.origem_custo] ?? i.origem_custo) : "sem custo",
      },
      {
        chave: null,
        rotulo: "Margem",
        num: true,
        negativo: (i) => numeroBruto(i.margem_bruta) < 0,
        celula: (i) => (i.sem_custo ? "—" : moeda(i.margem_bruta)),
      },
      {
        chave: null,
        rotulo: "Margem %",
        num: true,
        negativo: (i) => numeroBruto(i.margem_pct) < 0,
        celula: (i) => (i.sem_custo ? "—" : percentual(i.margem_pct)),
      },
    ],
    [],
  );

  return (
    <>
      <CabecalhoPagina
        titulo={cabecalho?.origem === "pdv" ? "Venda de balcão (PDV)" : `Pedido ${cabecalho?.num_pedido ?? chave}`}
        descricao={cabecalho?.origem === "pdv" ? "Venda individual do balcão com composição de receita, custo e margem." : "Resumo financeiro e rastreabilidade dos itens faturados."}
        voltar={
          <Button
            variant="link"
            size="sm"
            nativeButton={false}
            className="mb-1 h-auto p-0"
            render={<Link to={voltar} />}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            {porSku ? "Voltar para o SKU" : "Voltar para os pedidos"}
          </Button>
        }
        contexto={cabecalho && <><Badge tom="info">{cabecalho.origem === "pdv" ? "PDV" : "Pedido faturado"}</Badge>{cabecalho.canal.toLowerCase().includes("marketplace") && <Badge tom="atencao">Marketplace</Badge>}</>}
      />

      {isError && <Erro mensagem={(error as Error).message} />}
      {isPending && <SkeletonTabela linhas={6} colunas={13} />}

      {data && cabecalho && (
        <>
          {cabecalho.canal.toLowerCase().includes("marketplace") && (
            <AvisoMarketplace texto={data.escopo.aviso_marketplace} />
          )}

          <GradeKpis>
            <CartaoKpi rotulo="Receita líquida" valor={moeda(cabecalho.receita_liquida)} apoio={`${moeda(cabecalho.desconto)} em descontos`} />
            <CartaoKpi rotulo="Custo" valor={moeda(cabecalho.custo)} apoio="Custo considerado no pedido" />
            <CartaoKpi rotulo="Margem bruta" valor={moeda(cabecalho.margem)} apoio={percentual(cabecalho.margem_pct)} tom={numeroBruto(cabecalho.margem) < 0 ? "critico" : "bom"} />
            <CartaoKpi rotulo="Itens fora do KPI" valor={inteiro(cabecalho.itens_fora_do_kpi)} apoio={`de ${inteiro(cabecalho.itens)} itens`} tom={cabecalho.itens_fora_do_kpi ? "atencao" : "bom"} />
          </GradeKpis>

          <div className="mb-3.5">
            <Secao titulo="Formação da margem após desconto">
              {/* No celular a formula empilha e o operador gira 90°: em linha,
                  quatro parcelas de moeda nao cabem em 360px sem quebrar o
                  numero no meio. */}
              <div className="grid items-center gap-2.5 max-md:grid-cols-1 md:[grid-template-columns:repeat(7,auto)]">
                <Parcela rotulo="Receita bruta" valor={moeda(cabecalho.receita)} />
                <Operador>−</Operador>
                <Parcela rotulo="Desconto" valor={moeda(cabecalho.desconto)} />
                <Operador>−</Operador>
                <Parcela rotulo="Custo" valor={moeda(cabecalho.custo)} />
                <Operador>=</Operador>
                <Parcela rotulo="Margem líquida" valor={moeda(cabecalho.margem_liquida)} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                A margem bruta antes do desconto é {moeda(cabecalho.margem)}. Após o
                desconto, a margem líquida é {moeda(cabecalho.margem_liquida)} (
                {percentual(cabecalho.margem_liquida_pct)}).
              </p>
            </Secao>
          </div>

          <Abas valor={aba} aoMudar={setAba} opcoes={[{ valor: "informacoes", rotulo: "Informações" }, { valor: "itens", rotulo: "Itens", contador: data.itens.length }]} />

          {aba === "informacoes" && (
            <Secao titulo="Informações comerciais">
              <GradeLeitura>
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
              </GradeLeitura>

              <h3 className="mt-5 text-sm font-semibold">Informações fiscais</h3>
              <GradeLeitura>
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
              </GradeLeitura>

              {cabecalho.itens_fora_do_kpi > 0 && (
                <Nota>
                  {inteiro(cabecalho.itens_fora_do_kpi)} de {inteiro(cabecalho.itens)} itens
                  somam receita mas ficam fora do indicador de margem — os percentuais
                  acima são calculados só sobre os itens restantes.
                </Nota>
              )}
              {cabecalho.linhas_fora_do_recorte > 0 && (
                <Nota>
                  Este pedido tem mais {inteiro(cabecalho.linhas_fora_do_recorte)} linhas
                  fora do filtro atual (outro armazém, outro vendedor ou outra
                  competência). Os totais aqui são só do recorte que você está vendo.
                </Nota>
              )}
            </Secao>
          )}

          {aba === "itens" && (
            <Secao
              titulo="Itens faturados"
              nota="Os filtros abaixo não alteram os totais do pedido."
              acao={
                <Segmentado
                  valor={filtroItens}
                  aoMudar={setFiltroItens}
                  rotulo="Filtrar itens"
                  opcoes={[
                    ["todos", "Todos"],
                    ["fora_kpi", "Fora do KPI"],
                    ["negativos", "Margem negativa"],
                    ["sem_custo", "Sem custo"],
                  ]}
                />
              }
            >
              <Tabela
                linhas={itensVisiveis}
                colunas={colunas}
                chaveLinha={(i) => String(i.id)}
                rotuloAcessivel="Itens faturados do pedido"
                vazio="Nenhum item neste filtro."
              />
            </Secao>
          )}
        </>
      )}
    </>
  );
}
