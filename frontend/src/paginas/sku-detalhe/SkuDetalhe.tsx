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
 *
 *  As quatro secoes eram quatro cartoes empilhados: a pagina passava de tres
 *  telas de rolagem e o que se procurava ficava sempre embaixo. Viraram abas,
 *  como nas demais telas de detalhe.
 */

import { CompraSku, EstoqueSku, PedidoDoSku, VendedorDoSku, useSku } from "@entidades/sku";
import { ArrowLeftIcon, EyeIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import { Button } from "@compartilhado/ui/atomos/button";
import { SkeletonTabela } from "@compartilhado/ui/moleculas/Skeleton";
import { Tabela, type Coluna } from "@compartilhado/ui/organismos/Tabela";
import { Abas, AvisoMarketplace, Badge, CabecalhoPagina, Erro, Nota, Secao, Vazio } from "@compartilhado/ui";
import { escreverFiltros, useAbaUrl, useFiltrosUrl } from "@entidades/filtros";
import {
  competencia,
  dataCurta,
  inteiro,
  moeda,
  numeroBruto,
  percentual,
  rotuloNota,
} from "@compartilhado/lib/formato";

/** Rotulo de cada degrau da cascata de custo (Regra 3) — o mesmo mapa que o
 *  detalhe do pedido usa: e ele que explica quase toda margem fora do esperado. */
const ORIGEM_CUSTO: Record<string, string> = {
  saida: "Saída",
  medio: "Custo do Cadastro",
  ultima_compra: "valor Ult.Compra",
  outro_armazem: "Mesmo SKU em outro armazém",
};

/** Par rotulo/valor. E leitura, nao formulario. */
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

/** Por que esta linha nao entra no KPI de margem. Vazio = ela entra. */
function motivosForaDoKpi(linha: PedidoDoSku): string[] {
  const motivos: string[] = [];
  if (linha.sem_custo) motivos.push("sem custo");
  if (linha.outlier_custo) motivos.push("outlier de custo");
  if (!linha.tes_receita) motivos.push("TES não-venda");
  return motivos;
}

const COLUNAS_ESTOQUE: readonly Coluna<EstoqueSku>[] = [
  { chave: null, rotulo: "Armazém", fixa: true, celula: (e) => e.armazem_rotulo ?? e.armazem ?? "—" },
  { chave: null, rotulo: "Saldo atual", num: true, celula: (e) => inteiro(e.saldo_atual) },
  { chave: null, rotulo: "Saldo disponível", num: true, celula: (e) => inteiro(e.saldo_disponivel) },
  { chave: null, rotulo: "Custo unit.", num: true, celula: (e) => moeda(e.custo_unitario) },
  { chave: null, rotulo: "Últ. compra (valor)", num: true, celula: (e) => moeda(e.vlr_ult_compra) },
  { chave: null, rotulo: "Snapshot", celula: (e) => (e.dt_carga ? dataCurta(e.dt_carga) : "—") },
];

const COLUNAS_COMPRAS: readonly Coluna<CompraSku>[] = [
  {
    chave: null,
    rotulo: "Emissão",
    fixa: true,
    celula: (c) => (c.dt_emissao ? dataCurta(c.dt_emissao) : "—"),
  },
  {
    chave: null,
    rotulo: "Documento",
    celula: (c) => <span className="num-tabular">{rotuloNota(c.documento, c.serie) ?? "—"}</span>,
  },
  {
    chave: null,
    rotulo: "Fornecedor",
    celula: (c) => (c.forn_cliente ? `${c.forn_cliente}${c.loja ? `/${c.loja}` : ""}` : "—"),
  },
  { chave: null, rotulo: "Armazém", celula: (c) => c.armazem ?? "—" },
  { chave: null, rotulo: "Qtd", num: true, celula: (c) => inteiro(c.quantidade) },
  { chave: null, rotulo: "Unitário", num: true, celula: (c) => moeda(c.vlr_unitario) },
  { chave: null, rotulo: "Total", num: true, celula: (c) => moeda(c.custo_total) },
];

const COLUNAS_VENDEDORES: readonly Coluna<VendedorDoSku>[] = [
  {
    chave: null,
    rotulo: "Vendedor",
    fixa: true,
    celula: (v) =>
      v.vendedor_nome ?? (v.vendedor_codigo ? v.vendedor_codigo : "sem vendedor (marketplace)"),
  },
  { chave: null, rotulo: "Pedidos", num: true, celula: (v) => inteiro(v.pedidos) },
  { chave: null, rotulo: "Qtd", num: true, celula: (v) => inteiro(v.quantidade) },
  { chave: null, rotulo: "Receita", num: true, celula: (v) => moeda(v.receita) },
  {
    chave: null,
    rotulo: "Margem",
    num: true,
    negativo: (v) => numeroBruto(v.margem) < 0,
    celula: (v) => moeda(v.margem),
  },
  {
    chave: null,
    rotulo: "Margem %",
    num: true,
    negativo: (v) => numeroBruto(v.margem_pct) < 0,
    celula: (v) => percentual(v.margem_pct),
  },
];

export function SkuDetalhe() {
  const { sku = "" } = useParams();
  const [filtros] = useFiltrosUrl();
  const consulta = escreverFiltros(filtros);
  const voltar = `/skus${consulta ? `?${consulta}` : ""}`;

  const [aba, setAba] = useAbaUrl(
    ["resumo", "pedidos", "vendedores", "suprimentos"] as const,
    "resumo",
  );
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

  const cabecalho = data?.sku;

  const colunas: readonly Coluna<PedidoDoSku>[] = useMemo(
    () => [
      {
        chave: "pedido",
        rotulo: "Pedido",
        fixa: true,
        celula: (p) => {
          const motivos = motivosForaDoKpi(p);
          return (
            <span className="num-tabular flex flex-wrap items-center gap-1.5">
              {p.origem === "pdv" ? "Balcão (PDV)" : p.num_pedido}
              {motivos.length > 0 && <Badge tom="atencao">{motivos.join(" · ")}</Badge>}
            </span>
          );
        },
        titulo: (p) =>
          motivosForaDoKpi(p).length ? "Soma na receita, fora do KPI de margem" : "",
      },
      {
        chave: "nota",
        rotulo: "Nota",
        celula: (p) => (
          <span className="num-tabular">{rotuloNota(p.nota_fiscal, p.serie_nf) ?? "—"}</span>
        ),
      },
      {
        chave: "emissao",
        rotulo: "Emissão",
        celula: (p) =>
          p.emissao ? dataCurta(p.emissao) : p.competencia ? competencia(p.competencia) : "—",
      },
      {
        chave: "cliente",
        rotulo: "Cliente",
        truncar: 240,
        titulo: (p) => p.nome_cliente ?? "",
        celula: (p) => p.nome_cliente ?? p.cod_cliente ?? "—",
      },
      { chave: null, rotulo: "Canal", celula: (p) => p.canal },
      { chave: null, rotulo: "Vendedor", celula: (p) => p.vendedor_nome ?? "—" },
      { chave: null, rotulo: "Armazém", celula: (p) => p.armazem_rotulo ?? p.armazem ?? "—" },
      { chave: "quantidade", rotulo: "Qtd", num: true, celula: (p) => inteiro(p.quantidade) },
      { chave: null, rotulo: "Unitário", num: true, celula: (p) => moeda(p.vlr_unitario) },
      { chave: "receita", rotulo: "Receita", num: true, celula: (p) => moeda(p.receita_bruta) },
      {
        chave: null,
        rotulo: "Custo unit.",
        num: true,
        celula: (p) => moeda(p.custo_unitario_ref),
      },
      {
        chave: null,
        rotulo: "Origem do custo",
        celula: (p) =>
          p.origem_custo ? (ORIGEM_CUSTO[p.origem_custo] ?? p.origem_custo) : "sem custo",
      },
      {
        chave: "margem",
        rotulo: "Margem",
        num: true,
        negativo: (p) => numeroBruto(p.margem_bruta) < 0,
        celula: (p) => (p.sem_custo ? "—" : moeda(p.margem_bruta)),
      },
      {
        chave: "margem_pct",
        rotulo: "Margem %",
        num: true,
        negativo: (p) => numeroBruto(p.margem_pct) < 0,
        celula: (p) => (p.sem_custo ? "—" : percentual(p.margem_pct)),
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
                to={`/skus/${encodeURIComponent(sku)}/pedidos/${encodeURIComponent(p.chave)}${
                  consulta ? `?${consulta}` : ""
                }`}
                aria-label={`Visualizar detalhes do pedido ${p.chave}`}
              />
            }
          >
            <EyeIcon data-icon="inline-start" />
            Visualizar
          </Button>
        ),
      },
    ],
    [consulta, sku],
  );

  return (
    <>
      <CabecalhoPagina
        titulo={sku}
        descricao={cabecalho?.descricao ?? "Pedidos, notas e vendedores em que este item aparece."}
        voltar={
          <Button
            variant="link"
            size="sm"
            nativeButton={false}
            className="mb-1 h-auto p-0"
            render={<Link to={voltar} />}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Voltar para os SKUs
          </Button>
        }
      />

      {isError && <Erro mensagem={(error as Error).message} />}
      {isPending && <SkeletonTabela linhas={8} colunas={15} />}

      {data && cabecalho && (
        <>
          {cabecalho.canais.some((c) => c.toLowerCase().includes("marketplace")) && (
            <AvisoMarketplace texto={data.escopo.aviso_marketplace} />
          )}

          <Abas
            valor={aba}
            aoMudar={setAba}
            opcoes={[
              { valor: "resumo", rotulo: "Resumo" },
              { valor: "pedidos", rotulo: "Pedidos e notas", contador: data.total },
              { valor: "vendedores", rotulo: "Vendedores", contador: data.vendedores.length },
              ...(data.suprimentos_visiveis
                ? ([{ valor: "suprimentos" as const, rotulo: "Suprimentos" }] as const)
                : []),
            ]}
          />

          {aba === "resumo" && (
            <Secao titulo="Item">
              <GradeLeitura>
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
                  valor={cabecalho.primeira_venda ? dataCurta(cabecalho.primeira_venda) : "—"}
                />
                <Campo
                  rotulo="Última venda"
                  valor={cabecalho.ultima_venda ? dataCurta(cabecalho.ultima_venda) : "—"}
                />
              </GradeLeitura>

              <h3 className="mt-5 text-sm font-semibold">Totais</h3>
              <GradeLeitura>
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
              </GradeLeitura>

              {cabecalho.itens_fora_do_kpi > 0 && (
                <Nota>
                  {inteiro(cabecalho.itens_fora_do_kpi)} de {inteiro(cabecalho.linhas)} linhas
                  somam receita mas ficam fora do indicador de margem — os percentuais acima
                  são calculados só sobre as restantes. A tela <em>Por SKU</em> já exclui essas
                  linhas do total, então os números aqui podem ser maiores que os de lá.
                </Nota>
              )}
              {cabecalho.linhas_fora_do_recorte > 0 && (
                <Nota>
                  Este SKU tem mais {inteiro(cabecalho.linhas_fora_do_recorte)} linhas fora do
                  filtro atual (outro armazém, outro canal ou outra competência). Os totais
                  aqui são só do recorte que você está vendo.
                </Nota>
              )}
            </Secao>
          )}

          {aba === "pedidos" && (
            <Secao
              titulo={`${inteiro(data.total)} pedidos e notas`}
              nota="Uma linha por pedido e nota fiscal — o mesmo pedido pode faturar em mais de uma. Clique no cabeçalho para ordenar."
            >
              <Tabela
                linhas={data.pedidos}
                colunas={colunas}
                chaveLinha={(p) => `${p.chave}-${p.serie_nf}-${p.nota_fiscal}`}
                rotuloAcessivel={`Pedidos e notas do SKU ${sku}`}
                vazio="Nenhum pedido no período e filtros selecionados."
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

          {aba === "vendedores" && (
            <Secao
              titulo="Vendedores"
              nota="Quem vendeu o item no recorte. Não é ranking de vendedor: o Marketplace (código 72) é o integrador Lexos, não uma pessoa, e aparece aqui como “sem vendedor”."
            >
              <Tabela
                linhas={data.vendedores}
                colunas={COLUNAS_VENDEDORES}
                chaveLinha={(v) => v.vendedor_codigo ?? "sem-vendedor"}
                rotuloAcessivel={`Vendedores do SKU ${sku}`}
                vazio="Nenhum vendedor no recorte."
              />
            </Secao>
          )}

          {aba === "suprimentos" && data.suprimentos_visiveis && (
            <div className="flex flex-col gap-3.5">
              <Secao
                titulo="Estoque"
                nota="Último snapshot do SB2. O valor da última compra vem do cadastro e não tem data — a data real está nas notas de entrada abaixo."
              >
                {data.estoque.length === 0 ? (
                  <Vazio mensagem="Item sem posição de estoque no último SB2 carregado." />
                ) : (
                  <Tabela
                    linhas={data.estoque}
                    colunas={COLUNAS_ESTOQUE}
                    chaveLinha={(e) => String(e.armazem)}
                    rotuloAcessivel={`Estoque do SKU ${sku}`}
                  />
                )}
              </Secao>

              <Secao
                titulo="Últimas compras"
                nota="Notas de entrada (SD1, tipo N). O Protheus exporta só o código do fornecedor, não o nome."
              >
                {data.compras.length === 0 ? (
                  <Vazio mensagem="Sem nota de entrada para este item no período carregado do SD1." />
                ) : (
                  <Tabela
                    linhas={data.compras}
                    colunas={COLUNAS_COMPRAS}
                    chaveLinha={(c) => `${c.documento}-${c.serie}-${c.armazem}-${c.dt_emissao}`}
                    rotuloAcessivel={`Últimas compras do SKU ${sku}`}
                  />
                )}
              </Secao>
            </div>
          )}
        </>
      )}
    </>
  );
}
