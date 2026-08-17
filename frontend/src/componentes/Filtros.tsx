import { useOpcoes } from "../api/hooks";
import type { Filtros } from "../api/tipos";
import { competencia } from "../formato";

type Props = {
  valor: Filtros;
  aoMudar: (f: Filtros) => void;
  /** O ranking de vendedor ja e restrito a venda interna: o seletor de canal
   *  nao faz sentido la. */
  ocultarCanal?: boolean;
};

export function BarraFiltros({ valor, aoMudar, ocultarCanal }: Props) {
  const { data } = useOpcoes();
  const opcoes = data?.opcoes;

  function definir(chave: keyof Filtros) {
    return (evento: React.ChangeEvent<HTMLSelectElement>) =>
      aoMudar({ ...valor, [chave]: evento.target.value || undefined });
  }

  return (
    <div className="filtros">
      <div className="campo">
        <label htmlFor="f-inicio">Competência inicial</label>
        <select id="f-inicio" value={valor.competencia_inicio ?? ""} onChange={definir("competencia_inicio")}>
          <option value="">Todas</option>
          {opcoes?.competencias.map((c) => (
            <option key={c} value={c.slice(0, 7)}>
              {competencia(c)}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="f-fim">Competência final</label>
        <select id="f-fim" value={valor.competencia_fim ?? ""} onChange={definir("competencia_fim")}>
          <option value="">Todas</option>
          {opcoes?.competencias.map((c) => (
            <option key={c} value={c.slice(0, 7)}>
              {competencia(c)}
            </option>
          ))}
        </select>
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

      <div className="campo">
        <label htmlFor="f-grupo">Grupo</label>
        <select id="f-grupo" value={valor.grupo ?? ""} onChange={definir("grupo")}>
          <option value="">Todos</option>
          {opcoes?.grupos.map((g) => (
            <option key={g.codigo} value={g.codigo}>
              {g.rotulo ?? g.codigo}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="f-armazem">Armazém</label>
        <select id="f-armazem" value={valor.armazem ?? ""} onChange={definir("armazem")}>
          <option value="">Todos</option>
          {opcoes?.armazens.filter(Boolean).map((a) => (
            <option key={a} value={a!}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {Object.values(valor).some(Boolean) && (
        <button className="botao-alt" onClick={() => aoMudar({})}>
          Limpar
        </button>
      )}
    </div>
  );
}
