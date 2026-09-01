/** Skeletons de carregamento.
 *
 *  Cada skeleton imita a forma do conteudo que vai substituir — mesma altura,
 *  mesma contagem de linhas, mesma grade. Um spinner generico faz a pagina
 *  "pular" quando o dado chega; um skeleton com a geometria certa nao.
 *
 *  Todos sao `aria-hidden` com um `role="status"` no contorno: o leitor de tela
 *  ouve "carregando", nao a descricao de dezenas de retangulos.
 */

import { Card, CardContent } from "@/componentes/ui/card";
import { Skeleton as SkeletonUi } from "@/componentes/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/componentes/ui/table";

type Props = { largura?: string; altura?: string; raio?: string };

export function Barra({ largura = "100%", altura = "14px", raio }: Props) {
  return <SkeletonUi style={{ width: largura, height: altura, borderRadius: raio }} />;
}

function Contorno({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/** Fila de stat tiles. */
export function SkeletonTiles({ quantidade = 4 }: { quantidade?: number }) {
  return (
    <Contorno>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        {Array.from({ length: quantidade }, (_, i) => (
          <Card key={i}>
            <CardContent className="flex flex-col gap-2.5">
              <Barra largura="52%" altura="10px" />
              <Barra largura="72%" altura="26px" />
              <Barra largura="40%" altura="10px" />
            </CardContent>
          </Card>
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
      <Card>
        <CardContent className="flex flex-col gap-1.5">
          <Barra largura="180px" altura="12px" />
          <Barra largura="260px" altura="10px" />
          <div className="mt-4 flex items-end gap-1.5" style={{ height: altura }}>
            {barras.map((h, i) => (
              <div key={i} className="flex-1">
                <Barra altura={`${(h / 100) * altura}px`} raio="4px 4px 0 0" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
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
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Barra largura="150px" altura="12px" />
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: colunas }, (_, c) => (
                  <TableHead key={c}>
                    <Barra largura={c === 0 ? "60%" : "44%"} altura="9px" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: linhas }, (_, l) => (
                <TableRow key={l}>
                  {Array.from({ length: colunas }, (_, c) => (
                    <TableCell key={c}>
                      <Barra
                        largura={c === 0 ? "78%" : `${40 + ((l * 7 + c * 11) % 30)}%`}
                        altura="11px"
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Contorno>
  );
}
