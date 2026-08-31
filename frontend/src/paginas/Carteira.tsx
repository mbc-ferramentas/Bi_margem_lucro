/** Carteira de pedidos em aberto.
 *
 *  A tela responde uma pergunta que nenhuma outra responde: o que ja foi vendido
 *  e ainda nao saiu. Por isso ela nao fala em receita — fala em **valor em
 *  aberto**, que e so a parte que falta entregar. Um item faturado pela metade
 *  aparece aqui com a metade restante, e a outra metade ja esta na margem.
 *
 *  Duas ressalvas ficam visiveis na tela de proposito, e nao no rodape: a margem
 *  e prevista (sem nota nao ha custo congelado) e uma parte dos pedidos vem sem
 *  vendedor, porque o export do SC5 nao cobre a janela toda da carteira. Sem
 *  esses avisos o usuario conclui que o BI perdeu vendedor.
 */

import { useEffect, useState } from "react";

import { useCarteira, useOpcoesCarteira } from "../api/hooks";
import type { Filtros, ResumoCarteira } from "../api/tipos";
import { Erro, Vazio } from "../componentes/Layout";
import { Paginacao } from "../componentes/Paginacao";
import { SeletorGrupos } from "../componentes/SeletorGrupos";
import { SkeletonTabela, SkeletonTiles } from "../componentes/Skeleton";
import { Abas, BarraComposicao, CabecalhoPagina, CartaoKpi, ChipsFiltros, PainelInsight } from "../componentes/Visual";
import { useAbaUrl, useFiltrosUrl } from "../filtrosUrl";
import { dataCurta, inteiro, moeda, numeroBruto, percentual } from "../formato";

const COLUNAS = [
  { chave: "pedido", rotulo: "Pedido", num: false },
  { chave: "sku", rotulo: "SKU", num: false },
  { chave: null, rotulo: "Descrição", num: false },
  { chave: null, rotulo: "Cliente", num: false },
  { chave: null, rotulo: "Vendedor", num: false },
  { chave: null, rotulo: "Armazém", num: false },
  { chave: "entrega", rotulo: "Entrega", num: false },
  { chave: "dias", rotulo: "Dias", num: true },
  { chave: "quantidade", rotulo: "Qtd aberta", num: true },
  { chave: "valor", rotulo: "Valor aberto", num: true },
  { chave: "margem", rotulo: "Margem prev.", num: true },
  { chave: "margem_pct", rotulo: "Margem %", num: true },
] as const;

function Resumo({ resumo, verAtrasados }: { resumo: ResumoCarteira; verAtrasados: () => void }) {
  const atrasoPct =
    resumo.itens > 0 ? resumo.itens_atrasados / resumo.itens : null;

  return (
    <div className="grade-kpis">
      <CartaoKpi
        rotulo="Valor em aberto"
        valor={moeda(resumo.valor_aberto)}
        apoio={`${inteiro(resumo.itens)} itens em ${inteiro(resumo.pedidos)} pedidos`}
      />
      <CartaoKpi
        rotulo="Custo previsto"
        valor={moeda(resumo.custo_previsto)}
        apoio={
          resumo.itens_sem_custo > 0
            ? `${inteiro(resumo.itens_sem_custo)} itens sem custo de referência`
            : "Todos os itens com custo"
        }
      />
      <CartaoKpi
        rotulo="Margem prevista"
        valor={moeda(resumo.margem_prevista)}
        apoio={`${percentual(resumo.margem_prevista_pct)} sobre os itens com custo`}
      />
      <CartaoKpi
        rotulo="Entrega vencida"
        valor={moeda(resumo.valor_atrasado)}
        apoio={`${inteiro(resumo.itens_atrasados)} itens${
          atrasoPct === null ? "" : ` · ${percentual(atrasoPct)} da carteira`
        }`}
        tom={resumo.itens_atrasados ? "critico" : "bom"}
        aoClicar={verAtrasados}
      />
    </div>
  );
}

export function Carteira() {
  const [filtros, setFiltros] = useFiltrosUrl();
  const [aba, setAba] = useAbaUrl(["gerencial", "itens"] as const, "gerencial");
  const [busca, setBusca] = useState(filtros.busca ?? "");
  const [ordenar, setOrdenar] = useState("-valor");
  const [offset, setOffset] = useState(0);
  const [itensPorPagina, setItensPorPagina] = useState(25);
  useEffect(() => setBusca(filtros.busca ?? ""), [filtros.busca]);

  // Cascata armazem > grupo: as opcoes vem recortadas pelos filtros ativos.
  const opcoes = useOpcoesCarteira(filtros).data?.opcoes;
  const { data, isPending, isError, error } = useCarteira(
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

  function mudarFiltro(chave: keyof Filtros, valor: string) {
    setOffset(0);
    setFiltros({ ...filtros, [chave]: valor || undefined });
  }

  // Trocar de armazem pode deixar o grupo escolhido fora do recorte novo — manter
  // o antigo devolveria tela vazia sem explicar por que.
  function mudarArmazem(valor: string) {
    setOffset(0);
    setFiltros({ ...filtros, armazem: valor || undefined, grupo: [] });
  }

  // A busca so entra na query ao enviar: a cada tecla dispararia uma consulta
  // por caractere para uma tela que se usa procurando um numero de pedido.
  function enviarBusca(evento: React.FormEvent) {
    evento.preventDefault();
    setOffset(0);
    setFiltros({ ...filtros, busca: busca.trim() || undefined });
  }

  const total = data?.total ?? 0;
  const resumo = data?.resumo;

  return (
    <>
      <CabecalhoPagina titulo="Carteira em aberto" descricao="Acompanhe valor pendente, risco de atraso e margem prevista do que ainda falta entregar." />

      <div className="filtros">
        <div className="campo">
          <label htmlFor="c-situacao">Situação</label>
          <select
            id="c-situacao"
            value={filtros.situacao ?? ""}
            onChange={(e) => mudarFiltro("situacao", e.target.value)}
          >
            <option value="">Todos</option>
            <option value="atrasados">Entrega vencida</option>
            <option value="a_vencer">A vencer</option>
          </select>
        </div>

        <div className="campo">
          <label htmlFor="c-canal">Canal</label>
          <select
            id="c-canal"
            value={filtros.canal ?? ""}
            onChange={(e) => mudarFiltro("canal", e.target.value)}
          >
            <option value="">Todos</option>
            {opcoes?.canais.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="c-vendedor">Vendedor</label>
          <select
            id="c-vendedor"
            value={filtros.vendedor ?? ""}
            onChange={(e) => mudarFiltro("vendedor", e.target.value)}
          >
            <option value="">Todos</option>
            {opcoes?.vendedores.map((v) => (
              <option key={v.codigo} value={v.codigo}>
                {v.nome ?? v.codigo}
              </option>
            ))}
          </select>
        </div>

        {/* Armazem antes de grupo: a ordem na barra e a hierarquia da analise. */}
        <div className="campo">
          <label htmlFor="c-armazem">Armazém</label>
          <select
            id="c-armazem"
            value={filtros.armazem ?? ""}
            onChange={(e) => mudarArmazem(e.target.value)}
          >
            <option value="">Todos</option>
            {opcoes?.armazens.map((a) => (
              <option key={a.codigo} value={a.codigo}>
                {a.rotulo ?? a.codigo}
              </option>
            ))}
          </select>
        </div>

        <SeletorGrupos
          opcoes={opcoes?.grupos}
          valor={filtros.grupo}
          aoMudar={(grupos) => {
            setOffset(0);
            setFiltros({ ...filtros, grupo: grupos });
          }}
          idPrefixo="c"
        />


        <form className="campo" onSubmit={enviarBusca}>
          <label htmlFor="c-busca">Pedido, SKU ou descrição</label>
          <input
            id="c-busca"
            type="search"
            value={busca}
            placeholder="Ex.: 595496"
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>

      </div>
      <ChipsFiltros valor={filtros} aoMudar={(novos) => { setOffset(0); setFiltros(novos); }} />

      {isError && <Erro mensagem={(error as Error).message} />}
      {isPending && (
        <>
          <SkeletonTiles quantidade={4} />
          <SkeletonTabela linhas={12} colunas={12} />
        </>
      )}

      {resumo && <Resumo resumo={resumo} verAtrasados={() => { setOffset(0); setFiltros({ ...filtros, situacao: "atrasados" }); setAba("itens"); }} />}

      {data && <Abas valor={aba} aoMudar={setAba} opcoes={[{ valor: "gerencial", rotulo: "Visão gerencial" }, { valor: "itens", rotulo: "Itens em aberto", contador: total }]} />}

      {data && data.itens.length === 0 && aba === "itens" && (
        <Vazio mensagem="Nenhum item em aberto para os filtros selecionados." />
      )}

      {data && resumo && aba === "gerencial" && (
        <div className="cartao">
          <div className="secao-topo"><div><h2>Saúde da carteira</h2><p className="nota">Foto de {resumo.dt_foto ? dataCurta(resumo.dt_foto) : "—"}. Indicadores calculados sobre toda a carteira filtrada.</p></div></div>
          <BarraComposicao valor={numeroBruto(resumo.valor_aberto) ? numeroBruto(resumo.valor_atrasado) / numeroBruto(resumo.valor_aberto) : 0} rotulo="Valor com entrega vencida" detalhe={`${percentual(numeroBruto(resumo.valor_aberto) ? numeroBruto(resumo.valor_atrasado) / numeroBruto(resumo.valor_aberto) : null)} da carteira`} />
          <div className="grade-insights">
            <PainelInsight titulo="Itens atrasados" valor={inteiro(resumo.itens_atrasados)} texto={`${percentual(resumo.itens ? resumo.itens_atrasados / resumo.itens : null)} dos itens em aberto`} tom={resumo.itens_atrasados ? "critico" : "bom"} />
            <PainelInsight titulo="Qualidade do custo" valor={inteiro(resumo.itens_sem_custo)} texto="Itens sem custo de referência" tom={resumo.itens_sem_custo ? "atencao" : "bom"} />
            <PainelInsight titulo="Cobertura cadastral" valor={inteiro(resumo.itens_sem_cadastro)} texto="Itens sem cliente ou vendedor no SC5" tom={resumo.itens_sem_cadastro ? "atencao" : "bom"} />
          </div>
          <p className="nota">Entregas previstas de {resumo.entrega_min ? dataCurta(resumo.entrega_min) : "—"} a {resumo.entrega_max ? dataCurta(resumo.entrega_max) : "—"}. A margem é prevista; o custo definitivo só existe após o faturamento.</p>
        </div>
      )}

      {data && data.itens.length > 0 && resumo && aba === "itens" && (
        <div className="cartao">
          <div className="cabecalho">
            <div>
              <h2>{inteiro(total)} itens em aberto</h2>
              <p className="nota">
                Foto de {resumo.dt_foto ? dataCurta(resumo.dt_foto) : "—"} · entregas
                de {resumo.entrega_min ? dataCurta(resumo.entrega_min) : "—"} a{" "}
                {resumo.entrega_max ? dataCurta(resumo.entrega_max) : "—"} · clique
                no cabeçalho para ordenar.
              </p>
              {resumo.itens_sem_cadastro > 0 && (
                <p className="nota">
                  {inteiro(resumo.itens_sem_cadastro)} itens sem vendedor: o pedido
                  está fora da janela exportada do SC5, não é falha de cadastro.
                </p>
              )}
            </div>
            <div className="segmented" aria-label="Situação da entrega"><button aria-pressed={!filtros.situacao} onClick={() => mudarFiltro("situacao", "")}>Todos</button><button aria-pressed={filtros.situacao === "atrasados"} onClick={() => mudarFiltro("situacao", "atrasados")}>Vencidos</button><button aria-pressed={filtros.situacao === "a_vencer"} onClick={() => mudarFiltro("situacao", "a_vencer")}>A vencer</button></div>
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
                  <tr key={item.id}>
                    <td className="tabela-identidade" style={{ fontVariantNumeric: "tabular-nums" }}>
                      <strong>{item.num_pedido}</strong>
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{item.sku}</td>
                    <td
                      style={{
                        maxWidth: 300,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={item.descricao ?? ""}
                    >
                      {item.descricao ?? "—"}
                    </td>
                    <td
                      style={{
                        maxWidth: 220,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={item.nome_cliente ?? ""}
                    >
                      {item.nome_cliente ?? "—"}
                    </td>
                    <td>{item.vendedor_nome ?? "—"}</td>
                    <td>{item.armazem_rotulo ?? item.armazem ?? "—"}</td>
                    <td>
                      {item.atrasado ? <span className="badge badge-critico">Vencido{item.dias_em_aberto !== null ? ` há ${inteiro(item.dias_em_aberto)} dias` : ""}</span> : (item.dt_entrega ? dataCurta(item.dt_entrega) : "—")}
                    </td>
                    <td className="num">{inteiro(item.dias_em_aberto)}</td>
                    <td className="num">{inteiro(item.qtd_aberta)}</td>
                    <td className="num">{moeda(item.vlr_aberto)}</td>
                    <td
                      className={
                        numeroBruto(item.margem_prevista) < 0 ? "num negativo" : "num"
                      }
                    >
                      {item.sem_custo ? "—" : moeda(item.margem_prevista)}
                    </td>
                    <td
                      className={
                        numeroBruto(item.margem_prevista_pct) < 0
                          ? "num negativo"
                          : "num"
                      }
                    >
                      {item.sem_custo ? "—" : percentual(item.margem_prevista_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Paginacao
            total={total}
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

      {data && <p className="nota">{data.observacao}</p>}
    </>
  );
}
