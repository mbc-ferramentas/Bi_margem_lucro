import { useOpcoes } from "../api/hooks";
import type { Filtros } from "../api/tipos";
import { competencia } from "../formato";
import { SeletorGrupos } from "./SeletorGrupos";
import { ChipsFiltros } from "./Visual";

type Props = {
  valor: Filtros;
  aoMudar: (f: Filtros) => void;
  /** O ranking de vendedor ja e restrito a venda interna: o seletor de canal
   *  nao faz sentido la. */
  ocultarCanal?: boolean;
  /** Na lista de pedidos o armazem vem da rota: um select que discordasse da URL
   *  daria duas verdades para o mesmo recorte. */
  ocultarArmazem?: boolean;
};

export function BarraFiltros({ valor, aoMudar, ocultarCanal, ocultarArmazem }: Props) {
  // As opcoes vem recortadas pelos filtros ativos: escolher um armazem reduz a
  // lista de grupos aos que existem nele. Por isso o proprio `valor` entra aqui.
  const { data } = useOpcoes(valor);
  const opcoes = data?.opcoes;

  function definir(chave: keyof Filtros) {
    return (evento: React.ChangeEvent<HTMLSelectElement>) =>
      aoMudar({ ...valor, [chave]: evento.target.value || undefined });
  }

  // Trocar de armazem pode deixar o grupo escolhido fora do recorte novo. Manter
  // o grupo antigo devolveria tela vazia sem explicar por que.
  function definirArmazem(evento: React.ChangeEvent<HTMLSelectElement>) {
    aoMudar({ ...valor, armazem: evento.target.value || undefined, grupo: [] });
  }

  // As competencias sao AAAA-MM zero-padded: comparar como string ja ordena por
  // data, o que basta para bloquear um intervalo invertido antes do 400 da API.
  const inicio = valor.competencia_inicio ?? "";
  const fim = valor.competencia_fim ?? "";

  return (
    <><div className="filtros">
      <div className="campo campo-periodo">
        <span className="rotulo-grupo">Período</span>
        <div className="intervalo" role="group" aria-label="Período">
          <select
            id="f-inicio"
            aria-label="Competência inicial"
            value={inicio}
            onChange={definir("competencia_inicio")}
          >
            <option value="">Início</option>
            {opcoes?.competencias.map((c) => (
              <option key={c} value={c.slice(0, 7)} disabled={!!fim && c.slice(0, 7) > fim}>
                {competencia(c)}
              </option>
            ))}
          </select>
          <span className="ate">até</span>
          <select
            id="f-fim"
            aria-label="Competência final"
            value={fim}
            onChange={definir("competencia_fim")}
          >
            <option value="">Fim</option>
            {opcoes?.competencias.map((c) => (
              <option key={c} value={c.slice(0, 7)} disabled={!!inicio && c.slice(0, 7) < inicio}>
                {competencia(c)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!ocultarCanal && (
        <div className="campo">
          <label htmlFor="f-canal">Canal</label>
          <select id="f-canal" value={valor.canal ?? ""} onChange={definir("canal")}>
            <option value="">Todos</option>
            {opcoes?.canais.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Armazem antes de grupo: a ordem na barra e a hierarquia da analise. */}
      {!ocultarArmazem && (
        <div className="campo">
          <label htmlFor="f-armazem">Armazém</label>
          <select id="f-armazem" value={valor.armazem ?? ""} onChange={definirArmazem}>
            <option value="">Todos</option>
            {opcoes?.armazens.map((a) => (
              <option key={a.codigo} value={a.codigo}>
                {a.rotulo ?? a.codigo}
              </option>
            ))}
          </select>
        </div>
      )}

      <SeletorGrupos
        opcoes={opcoes?.grupos}
        valor={valor.grupo}
        aoMudar={(grupos) => aoMudar({ ...valor, grupo: grupos })}
        idPrefixo="f"
      />

    </div><ChipsFiltros valor={valor} aoMudar={aoMudar} /></>
  );
}
