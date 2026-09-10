/** O resumo da carteira dentro da Visao geral.
 *
 *  Fica numa secao propria e com a nota obrigatoria: o periodo ali e a **data
 *  de entrega prometida**, nao a competencia da venda, e somar os dois numeros
 *  inflaria o faturamento. */

import { Link } from "react-router";

import { dataCurta, inteiro, moeda, percentual } from "@compartilhado/lib/formato";
import { Button } from "@compartilhado/ui/atomos/button";
import {
  BarraComposicao,
  CartaoKpi,
  Erro,
  GradeKpis,
  Secao,
  Vazio,
} from "@compartilhado/ui";
import { SkeletonTiles } from "@compartilhado/ui/moleculas/Skeleton";
import type { ResumoCarteira } from "@entidades/carteira";

export function CarteiraEmAberto({
  carteira,
  resumoCarteira,
}: {
  carteira: { isPending: boolean; isError: boolean; error: unknown };
  resumoCarteira: ResumoCarteira | undefined;
}) {
  return (
        <Secao
          titulo="Carteira em aberto"
          nota={`${
            resumoCarteira?.dt_foto ? `Posição de ${dataCurta(resumoCarteira.dt_foto)}. ` : ""
          }O que já foi vendido e ainda não saiu. Não segue o filtro de competência: na carteira a data é a de entrega prometida, não a competência da venda.`}
          acao={
            <Button variant="link" size="sm" nativeButton={false} render={<Link to="/carteira" />}>
              Abrir carteira
            </Button>
          }
        >
          {carteira.isError && <Erro mensagem={(carteira.error as Error).message} />}
          {carteira.isPending && <SkeletonTiles quantidade={3} />}
          {resumoCarteira &&
            (resumoCarteira.itens === 0 ? (
              <Vazio mensagem="Nenhum pedido em aberto neste recorte." />
            ) : (
              <>
                <GradeKpis colunas={3} margem={false}>
                  <CartaoKpi
                    rotulo="Valor em aberto"
                    valor={moeda(resumoCarteira.valor_aberto)}
                    apoio={`${inteiro(resumoCarteira.pedidos)} pedidos · ${inteiro(
                      resumoCarteira.itens,
                    )} itens`}
                  />
                  <CartaoKpi
                    rotulo="Margem prevista"
                    valor={moeda(resumoCarteira.margem_prevista)}
                    apoio={`${percentual(
                      resumoCarteira.margem_prevista_pct,
                    )} — custo do cadastro, não congelado na nota`}
                  />
                  <CartaoKpi
                    rotulo="Entrega vencida"
                    valor={moeda(resumoCarteira.valor_atrasado)}
                    apoio={`${inteiro(resumoCarteira.itens_atrasados)} itens com prazo estourado`}
                    tom={resumoCarteira.itens_atrasados ? "critico" : "bom"}
                  />
                </GradeKpis>
                <BarraComposicao
                  valor={resumoCarteira.itens_atrasados / (resumoCarteira.itens || 1)}
                  rotulo="Itens com entrega vencida"
                  detalhe={`${inteiro(resumoCarteira.itens_atrasados)} de ${inteiro(
                    resumoCarteira.itens,
                  )}`}
                  tom={resumoCarteira.itens_atrasados ? "critico" : "bom"}
                />
              </>
            ))}
        </Secao>
  );
}
