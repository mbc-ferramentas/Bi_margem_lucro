/** Os dois graficos lado a lado: de onde a margem vem (armazem) e onde ela se
 *  forma ou escapa (SKU).
 *
 *  Ficam juntos porque sao a mesma pergunta em duas dimensoes, e porque a
 *  grade de duas colunas e o que os mantem na mesma altura de leitura. */

import { Link } from "react-router";

import { Grafico, type EChartsOption } from "@compartilhado/grafico";
import { Button } from "@compartilhado/ui/atomos/button";
import { Erro, Secao, Vazio } from "@compartilhado/ui";
import { SkeletonGrafico } from "@compartilhado/ui/moleculas/Skeleton";
import type { ItemSku } from "@entidades/sku";

import type { TotalArmazem } from "../modelo/agregacoes";
import { TOPO_SKU } from "../modelo/metricas";

/** O que estes graficos precisam saber de uma consulta: em que estado ela esta
 *  e se ja ha resposta. O conteudo em si chega ja agregado, por outra prop. */
type Consulta = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: object | undefined;
};

export function PainelDimensoes({
  consulta,
  armazens,
  porArmazem,
  opcaoArmazem,
  irParaArmazens,
  melhores,
  piores,
  extremos,
  opcaoSkus,
  irParaSku,
}: {
  consulta: string;
  armazens: Consulta;
  porArmazem: readonly TotalArmazem[];
  opcaoArmazem: EChartsOption;
  irParaArmazens: () => void;
  melhores: Consulta;
  piores: Consulta;
  extremos: readonly ItemSku[];
  opcaoSkus: EChartsOption;
  irParaSku: (marca: { nome: string; serie: number; indice: number }) => void;
}) {
  return (
        <div className="grid gap-4 lg:grid-cols-2">
          <Secao
            titulo="De onde vem a margem"
            nota="Total por armazém, com a margem sobre a receita do próprio armazém."
            acao={
              <Button variant="link" size="sm" nativeButton={false} render={<Link to={`/armazens${consulta ? `?${consulta}` : ""}`} />}>
                Abrir por armazém
              </Button>
            }
          >
            {armazens.isError && <Erro mensagem={(armazens.error as Error).message} />}
            {armazens.isPending && <SkeletonGrafico altura={260} />}
            {armazens.data &&
              (porArmazem.length === 0 ? (
                <Vazio mensagem="Nenhum armazém no recorte selecionado." />
              ) : (
                <Grafico
                  opcao={opcaoArmazem}
                  altura={320}
                  rotuloAcessivel="Margem bruta por armazém, do maior para o menor."
                  aoClicar={irParaArmazens}
                />
              ))}
          </Secao>

          <Secao
            titulo="Onde a margem se forma e onde escapa"
            nota={`Os ${TOPO_SKU} SKUs que mais somam e os ${TOPO_SKU} que mais tiram, na mesma escala.`}
            acao={
              <Button variant="link" size="sm" nativeButton={false} render={<Link to={`/skus${consulta ? `?${consulta}` : ""}`} />}>
                Abrir por SKU
              </Button>
            }
          >
            {(melhores.isError || piores.isError) && (
              <Erro
                mensagem={((melhores.error ?? piores.error) as Error)?.message ?? "Falha ao carregar os SKUs."}
              />
            )}
            {(melhores.isPending || piores.isPending) && <SkeletonGrafico altura={260} />}
            {melhores.data &&
              piores.data &&
              (extremos.length === 0 ? (
                <Vazio mensagem="Nenhum SKU no recorte selecionado." />
              ) : (
                <Grafico
                  opcao={opcaoSkus}
                  altura={320}
                  rotuloAcessivel="Margem bruta por SKU: os que mais somam e os que mais tiram."
                  aoClicar={irParaSku}
                />
              ))}
          </Secao>
        </div>
  );
}
