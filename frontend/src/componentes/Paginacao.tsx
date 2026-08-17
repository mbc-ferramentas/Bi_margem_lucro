import { inteiro } from "../formato";

export const OPCOES_ITENS_POR_PAGINA = [25, 50, 100, 150, 200] as const;

type Propriedades = { total: number; offset: number; itensPorPagina: number; aoMudarOffset: (offset: number) => void; aoMudarItensPorPagina: (quantidade: number) => void; };

export function Paginacao({ total, offset, itensPorPagina, aoMudarOffset, aoMudarItensPorPagina }: Propriedades) {
  const inicio = total === 0 ? 0 : offset + 1;
  const fim = Math.min(offset + itensPorPagina, total);
  return (
    <div className="paginacao">
      <label className="paginacao-tamanho">Itens por página
        <select value={itensPorPagina} onChange={(e) => aoMudarItensPorPagina(Number(e.target.value))}>
          {OPCOES_ITENS_POR_PAGINA.map((quantidade) => <option key={quantidade} value={quantidade}>{quantidade}</option>)}
        </select>
      </label>
      <span className="nota" role="status">{inteiro(inicio)}–{inteiro(fim)} de {inteiro(total)}</span>
      <div className="paginacao-acoes">
        <button className="botao-alt" disabled={offset === 0} onClick={() => aoMudarOffset(Math.max(0, offset - itensPorPagina))}>Anterior</button>
        <button className="botao-alt" disabled={offset + itensPorPagina >= total} onClick={() => aoMudarOffset(offset + itensPorPagina)}>Próxima</button>
      </div>
    </div>
  );
}
