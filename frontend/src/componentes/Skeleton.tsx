/** Skeletons de carregamento.
 *
 *  Cada skeleton imita a forma do conteudo que vai substituir — mesma altura,
 *  mesma contagem de linhas, mesma grade. Um spinner generico faz a pagina
 *  "pular" quando o dado chega; um skeleton com a geometria certa nao.
 *
 *  Todos sao `aria-hidden` com um `role="status"` no contorno: o leitor de tela
 *  ouve "carregando", nao a descricao de dezenas de retangulos.
 */

type Props = { largura?: string; altura?: string; raio?: string };

export function Barra({ largura = "100%", altura = "14px", raio }: Props) {
  return (
    <div className="sk" style={{ width: largura, height: altura, borderRadius: raio }} />
  );
}

function Contorno({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only" style={{ position: "absolute", left: "-9999px" }}>
        Carregando
      </span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/** Fila de stat tiles. */
export function SkeletonTiles({ quantidade = 4 }: { quantidade?: number }) {
  return (
    <Contorno>
      <div className="grade grade-tiles">
        {Array.from({ length: quantidade }, (_, i) => (
          <div className="cartao tile" key={i}>
            <Barra largura="52%" altura="10px" />
            <div style={{ height: 10 }} />
            <Barra largura="72%" altura="26px" />
            <div style={{ height: 8 }} />
            <Barra largura="40%" altura="10px" />
          </div>
        ))}
      </div>
    </Contorno>
  );
}

/** Area de grafico: reserva a altura exata para a troca nao deslocar a pagina. */
export function SkeletonGrafico({ altura = 300 }: { altura?: number }) {
  const barras = [58, 74, 46, 88, 63, 79, 52, 92, 68, 55, 81, 71];
  return (
    <Contorno>
      <div className="cartao">
        <Barra largura="180px" altura="12px" />
        <div style={{ height: 6 }} />
        <Barra largura="260px" altura="10px" />
        <div
          style={{
            height: altura,
            display: "flex",
            alignItems: "flex-end",
            gap: 6,
            marginTop: 18,
          }}
        >
          {barras.map((h, i) => (
            <div key={i} style={{ flex: 1 }}>
              <Barra altura={`${(h / 100) * altura}px`} raio="4px 4px 0 0" />
            </div>
          ))}
        </div>
      </div>
    </Contorno>
  );
}

/** Tabela: mesma contagem de colunas e linhas do conteudo real. */
export function SkeletonTabela({
  linhas = 8,
  colunas = 6,
}: {
  linhas?: number;
  colunas?: number;
}) {
  return (
    <Contorno>
      <div className="cartao">
        <Barra largura="150px" altura="12px" />
        <div style={{ height: 16 }} />
        <table>
          <thead>
            <tr>
              {Array.from({ length: colunas }, (_, c) => (
                <th key={c}>
                  <Barra largura={c === 0 ? "60%" : "44%"} altura="9px" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: linhas }, (_, l) => (
              <tr key={l}>
                {Array.from({ length: colunas }, (_, c) => (
                  <td key={c}>
                    <Barra
                      largura={c === 0 ? "78%" : `${40 + ((l * 7 + c * 11) % 30)}%`}
                      altura="11px"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Contorno>
  );
}
