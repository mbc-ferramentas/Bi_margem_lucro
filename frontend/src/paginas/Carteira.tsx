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

import { useEffect, useMemo, useState } from "react";

import { useCarteira, useOpcoesCarteira } from "../api/hooks";
import type { Filtros, ItemCarteira, ResumoCarteira } from "../api/tipos";
import { Input } from "@/componentes/ui/input";
import { Label } from "@/componentes/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/componentes/ui/select";
import { Erro, Vazio } from "../componentes/Layout";
import { SeletorGrupos } from "../componentes/SeletorGrupos";
import { SkeletonTabela, SkeletonTiles } from "../componentes/Skeleton";
import { Tabela, type Coluna } from "../componentes/Tabela";
import {
  Abas,
  Badge,
  BarraComposicao,
  CabecalhoPagina,
  CartaoKpi,
  ChipsFiltros,
  GradeInsights,
  GradeKpis,
  Nota,
  PainelInsight,
  Secao,
  Segmentado,
} from "../componentes/Visual";
import { useAbaUrl, useFiltrosUrl } from "../filtrosUrl";
import { dataCurta, inteiro, moeda, numeroBruto, percentual } from "../formato";


/** Sentinela do "sem filtro": ver a nota em Filtros.tsx. */
const TODOS = "__todos__";

const ROTULO = "text-[11px] tracking-wider text-muted-foreground uppercase";

function Campo({ id, rotulo, children }: { id: string; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={ROTULO}>
        {rotulo}
      </Label>
      {children}
    </div>
  );
}

function Resumo({ resumo, verAtrasados }: { resumo: ResumoCarteira; verAtrasados: () => void }) {
  const atrasoPct =
    resumo.itens > 0 ? resumo.itens_atrasados / resumo.itens : null;

  return (
    <GradeKpis>
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
    </GradeKpis>
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

  // A sentinela "Todos" precisa de um valor proprio: o Select do Base UI trata
  // "" como ausencia de selecao e cai no placeholder.
  function mudarFiltro(chave: keyof Filtros, valor: string | null) {
    setOffset(0);
    setFiltros({ ...filtros, [chave]: !valor || valor === TODOS ? undefined : valor });
  }

  // Trocar de armazem pode deixar o grupo escolhido fora do recorte novo — manter
  // o antigo devolveria tela vazia sem explicar por que.
  function mudarArmazem(valor: string | null) {
    setOffset(0);
    setFiltros({
      ...filtros,
      armazem: !valor || valor === TODOS ? undefined : valor,
      grupo: [],
    });
  }

  // A busca so entra na query ao enviar: a cada tecla dispararia uma consulta
  // por caractere para uma tela que se usa procurando um numero de pedido.
  function enviarBusca(evento: React.FormEvent) {
    evento.preventDefault();
    setOffset(0);
    setFiltros({ ...filtros, busca: busca.trim() || undefined });
  }

  const colunas: readonly Coluna<ItemCarteira>[] = useMemo(
    () => [
      {
        chave: "pedido",
        rotulo: "Pedido",
        fixa: true,
        celula: (i) => <strong className="num-tabular">{i.num_pedido}</strong>,
      },
      { chave: "sku", rotulo: "SKU", celula: (i) => <span className="num-tabular">{i.sku}</span> },
      {
        chave: null,
        rotulo: "Descrição",
        truncar: 300,
        titulo: (i) => i.descricao ?? "",
        celula: (i) => i.descricao ?? "—",
      },
      {
        chave: null,
        rotulo: "Cliente",
        truncar: 220,
        titulo: (i) => i.nome_cliente ?? "",
        celula: (i) => i.nome_cliente ?? "—",
      },
      { chave: null, rotulo: "Vendedor", celula: (i) => i.vendedor_nome ?? "—" },
      { chave: null, rotulo: "Armazém", celula: (i) => i.armazem_rotulo ?? i.armazem ?? "—" },
      {
        chave: "entrega",
        rotulo: "Entrega",
        celula: (i) =>
          i.atrasado ? (
            <Badge tom="critico">
              Vencido
              {i.dias_em_aberto !== null ? ` há ${inteiro(i.dias_em_aberto)} dias` : ""}
            </Badge>
          ) : i.dt_entrega ? (
            dataCurta(i.dt_entrega)
          ) : (
            "—"
          ),
      },
      { chave: "dias", rotulo: "Dias", num: true, celula: (i) => inteiro(i.dias_em_aberto) },
      { chave: "quantidade", rotulo: "Qtd aberta", num: true, celula: (i) => inteiro(i.qtd_aberta) },
      { chave: "valor", rotulo: "Valor aberto", num: true, celula: (i) => moeda(i.vlr_aberto) },
      {
        chave: "margem",
        rotulo: "Margem prev.",
        num: true,
        negativo: (i) => numeroBruto(i.margem_prevista) < 0,
        celula: (i) => (i.sem_custo ? "—" : moeda(i.margem_prevista)),
      },
      {
        chave: "margem_pct",
        rotulo: "Margem %",
        num: true,
        negativo: (i) => numeroBruto(i.margem_prevista_pct) < 0,
        celula: (i) => (i.sem_custo ? "—" : percentual(i.margem_prevista_pct)),
      },
    ],
    [],
  );

  const total = data?.total ?? 0;
  const resumo = data?.resumo;

  return (
    <>
      <CabecalhoPagina titulo="Carteira em aberto" descricao="Acompanhe valor pendente, risco de atraso e margem prevista do que ainda falta entregar." />

      <div className="mb-2.5 flex flex-wrap items-end gap-2.5">
        <Campo id="c-situacao" rotulo="Situação">
          <Select
            value={filtros.situacao ?? TODOS}
            onValueChange={(valor) => mudarFiltro("situacao", valor)}
          >
            <SelectTrigger id="c-situacao" size="sm" className="min-w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={TODOS}>Todos</SelectItem>
                <SelectItem value="atrasados">Entrega vencida</SelectItem>
                <SelectItem value="a_vencer">A vencer</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Campo>

        <Campo id="c-canal" rotulo="Canal">
          <Select
            value={filtros.canal ?? TODOS}
            onValueChange={(valor) => mudarFiltro("canal", valor)}
          >
            <SelectTrigger id="c-canal" size="sm" className="min-w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {opcoes?.canais.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Campo>

        <Campo id="c-vendedor" rotulo="Vendedor">
          <Select
            value={filtros.vendedor ?? TODOS}
            onValueChange={(valor) => mudarFiltro("vendedor", valor)}
          >
            <SelectTrigger id="c-vendedor" size="sm" className="min-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {opcoes?.vendedores.map((v) => (
                  <SelectItem key={v.codigo} value={v.codigo}>
                    {v.nome ?? v.codigo}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Campo>

        {/* Armazem antes de grupo: a ordem na barra e a hierarquia da analise. */}
        <Campo id="c-armazem" rotulo="Armazém">
          <Select value={filtros.armazem ?? TODOS} onValueChange={mudarArmazem}>
            <SelectTrigger id="c-armazem" size="sm" className="min-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {opcoes?.armazens.map((a) => (
                  <SelectItem key={a.codigo} value={a.codigo}>
                    {a.rotulo ?? a.codigo}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Campo>

        <SeletorGrupos
          opcoes={opcoes?.grupos}
          valor={filtros.grupo}
          aoMudar={(grupos) => {
            setOffset(0);
            setFiltros({ ...filtros, grupo: grupos });
          }}
          idPrefixo="c"
        />

        <form className="flex flex-col gap-1.5" onSubmit={enviarBusca}>
          <Label htmlFor="c-busca" className={ROTULO}>
            Pedido, SKU ou descrição
          </Label>
          <Input
            id="c-busca"
            type="search"
            className="h-8 w-52"
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
        <Secao
          titulo="Saúde da carteira"
          nota={`Foto de ${resumo.dt_foto ? dataCurta(resumo.dt_foto) : "—"}. Indicadores calculados sobre toda a carteira filtrada.`}
        >
          <BarraComposicao
            valor={
              numeroBruto(resumo.valor_aberto)
                ? numeroBruto(resumo.valor_atrasado) / numeroBruto(resumo.valor_aberto)
                : 0
            }
            rotulo="Valor com entrega vencida"
            detalhe={`${percentual(
              numeroBruto(resumo.valor_aberto)
                ? numeroBruto(resumo.valor_atrasado) / numeroBruto(resumo.valor_aberto)
                : null,
            )} da carteira`}
          />
          <GradeInsights>
            <PainelInsight
              titulo="Itens atrasados"
              valor={inteiro(resumo.itens_atrasados)}
              texto={`${percentual(resumo.itens ? resumo.itens_atrasados / resumo.itens : null)} dos itens em aberto`}
              tom={resumo.itens_atrasados ? "critico" : "bom"}
            />
            <PainelInsight
              titulo="Qualidade do custo"
              valor={inteiro(resumo.itens_sem_custo)}
              texto="Itens sem custo de referência"
              tom={resumo.itens_sem_custo ? "atencao" : "bom"}
            />
            <PainelInsight
              titulo="Cobertura cadastral"
              valor={inteiro(resumo.itens_sem_cadastro)}
              texto="Itens sem cliente ou vendedor no SC5"
              tom={resumo.itens_sem_cadastro ? "atencao" : "bom"}
            />
          </GradeInsights>
          <Nota>
            Entregas previstas de {resumo.entrega_min ? dataCurta(resumo.entrega_min) : "—"} a{" "}
            {resumo.entrega_max ? dataCurta(resumo.entrega_max) : "—"}. A margem é prevista;
            o custo definitivo só existe após o faturamento.
          </Nota>
        </Secao>
      )}

      {data && data.itens.length > 0 && resumo && aba === "itens" && (
        <Secao
          titulo={`${inteiro(total)} itens em aberto`}
          nota={`Foto de ${resumo.dt_foto ? dataCurta(resumo.dt_foto) : "—"} · entregas de ${
            resumo.entrega_min ? dataCurta(resumo.entrega_min) : "—"
          } a ${resumo.entrega_max ? dataCurta(resumo.entrega_max) : "—"} · clique no cabeçalho para ordenar.`}
          acao={
            <Segmentado
              valor={filtros.situacao ?? TODOS}
              aoMudar={(valor) => mudarFiltro("situacao", valor)}
              rotulo="Situação da entrega"
              opcoes={[
                [TODOS, "Todos"],
                ["atrasados", "Vencidos"],
                ["a_vencer", "A vencer"],
              ]}
            />
          }
        >
          {resumo.itens_sem_cadastro > 0 && (
            <Nota>
              {inteiro(resumo.itens_sem_cadastro)} itens sem vendedor: o pedido está fora
              da janela exportada do SC5, não é falha de cadastro.
            </Nota>
          )}

          <Tabela
            linhas={data.itens}
            colunas={colunas}
            chaveLinha={(i) => String(i.id)}
            rotuloAcessivel="Itens em aberto na carteira"
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

      {data && <p className="mt-3 text-xs text-muted-foreground">{data.observacao}</p>}
    </>
  );
}
