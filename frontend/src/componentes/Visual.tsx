import { useId } from "react";

import type { Filtros } from "../api/tipos";
import { SeletorTema } from "./SeletorTema";

const ROTULOS_FILTRO: Partial<Record<keyof Filtros, string>> = {
  competencia_inicio: "De",
  competencia_fim: "Até",
  canal: "Canal",
  armazem: "Armazém",
  vendedor: "Vendedor",
  grupo: "Grupos",
  situacao: "Situação",
  busca: "Busca",
};

export function ChipsFiltros({ valor, aoMudar }: { valor: Filtros; aoMudar: (filtros: Filtros) => void }) {
  const ativos = Object.entries(valor).filter(([, item]) => Array.isArray(item) ? item.length > 0 : Boolean(item)) as [keyof Filtros, string | string[]][];
  if (!ativos.length) return null;
  function remover(chave: keyof Filtros) {
    const seguintes = { ...valor };
    delete seguintes[chave];
    if (chave === "armazem") seguintes.grupo = [];
    aoMudar(seguintes);
  }
  return (
    <div className="filtros-ativos" aria-label={`${ativos.length} filtros ativos`}>
      <span>Filtros ativos</span>
      {ativos.map(([chave, item]) => <button type="button" key={chave} onClick={() => remover(chave)} aria-label={`Remover filtro ${ROTULOS_FILTRO[chave] ?? chave}`}><strong>{ROTULOS_FILTRO[chave] ?? chave}:</strong> {Array.isArray(item) ? item.join(", ") : item} <span aria-hidden="true">×</span></button>)}
      <button type="button" className="limpar-chips" onClick={() => aoMudar({})}>Limpar tudo</button>
    </div>
  );
}

export function CabecalhoPagina({
  titulo,
  descricao,
  voltar,
  contexto,
}: {
  titulo: string;
  descricao: string;
  voltar?: React.ReactNode;
  contexto?: React.ReactNode;
}) {
  return (
    <div className="cabecalho cabecalho-pagina">
      <div>
        {voltar}
        <h1>{titulo}</h1>
        <p className="subtitulo">{descricao}</p>
        {contexto && <div className="contexto-pagina">{contexto}</div>}
      </div>
      <SeletorTema />
    </div>
  );
}

export function CartaoKpi({
  rotulo,
  valor,
  apoio,
  tom = "neutro",
  aoClicar,
}: {
  rotulo: string;
  valor: string;
  apoio?: string;
  tom?: "neutro" | "bom" | "atencao" | "critico";
  aoClicar?: () => void;
}) {
  const conteudo = (
    <>
      <span className="kpi-rotulo">{rotulo}</span>
      <strong className="kpi-valor">{valor}</strong>
      {apoio && <span className="kpi-apoio">{apoio}</span>}
    </>
  );
  return aoClicar ? (
    <button type="button" className={`cartao kpi kpi-${tom} kpi-acao`} onClick={aoClicar}>
      {conteudo}
    </button>
  ) : (
    <div className={`cartao kpi kpi-${tom}`}>{conteudo}</div>
  );
}

export function Abas<T extends string>({
  valor,
  opcoes,
  aoMudar,
  rotulo = "Seções da página",
}: {
  valor: T;
  opcoes: readonly { valor: T; rotulo: string; contador?: number }[];
  aoMudar: (valor: T) => void;
  rotulo?: string;
}) {
  const id = useId();
  function navegar(evento: React.KeyboardEvent<HTMLButtonElement>, indice: number) {
    if (evento.key !== "ArrowLeft" && evento.key !== "ArrowRight" && evento.key !== "Home" && evento.key !== "End") return;
    evento.preventDefault();
    const ultimo = opcoes.length - 1;
    const destino = evento.key === "Home" ? 0 : evento.key === "End" ? ultimo : evento.key === "ArrowRight" ? (indice + 1) % opcoes.length : (indice - 1 + opcoes.length) % opcoes.length;
    aoMudar(opcoes[destino].valor);
    const botoes = evento.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    requestAnimationFrame(() => botoes?.[destino]?.focus());
  }
  return (
    <div className="abas" role="tablist" aria-label={rotulo}>
      {opcoes.map((opcao, indice) => (
        <button
          key={opcao.valor}
          id={`${id}-${opcao.valor}`}
          type="button"
          role="tab"
          aria-selected={valor === opcao.valor}
          tabIndex={valor === opcao.valor ? 0 : -1}
          onClick={() => aoMudar(opcao.valor)}
          onKeyDown={(evento) => navegar(evento, indice)}
        >
          {opcao.rotulo}
          {opcao.contador !== undefined && <span className="aba-contador">{opcao.contador}</span>}
        </button>
      ))}
    </div>
  );
}

export function Badge({
  children,
  tom = "neutro",
}: {
  children: React.ReactNode;
  tom?: "neutro" | "info" | "bom" | "atencao" | "critico";
}) {
  return <span className={`badge badge-${tom}`}>{children}</span>;
}

export function PainelInsight({
  titulo,
  valor,
  texto,
  tom = "neutro",
}: {
  titulo: string;
  valor?: string;
  texto: string;
  tom?: "neutro" | "bom" | "atencao" | "critico";
}) {
  return (
    <div className={`painel-insight insight-${tom}`}>
      <span className="insight-titulo">{titulo}</span>
      {valor && <strong>{valor}</strong>}
      <span>{texto}</span>
    </div>
  );
}

export function BarraComposicao({
  valor,
  rotulo,
  detalhe,
}: {
  valor: number;
  rotulo: string;
  detalhe: string;
}) {
  const limitado = Math.max(0, Math.min(1, Number.isFinite(valor) ? valor : 0));
  return (
    <div className="composicao">
      <div className="composicao-legenda">
        <span>{rotulo}</span>
        <strong>{detalhe}</strong>
      </div>
      <div className="composicao-trilho" role="progressbar" aria-label={rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(limitado * 100)}>
        <span style={{ width: `${limitado * 100}%` }} />
      </div>
    </div>
  );
}
