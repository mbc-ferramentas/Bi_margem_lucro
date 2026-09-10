/** A margem escrita como conta: receita, desconto, custo, resultado.
 *
 *  Existe porque as tres subtracoes ficam em lugares diferentes no Protheus, e
 *  a nota ao pe e o que evita a pergunta recorrente de por que dois numeros da
 *  mesma tela discordam. */

import { moeda, percentual } from "@compartilhado/lib/formato";
import { Cascata, Nota, Secao } from "@compartilhado/ui";
import type { Kpis } from "@entidades/margem";

export function FormacaoDaMargem({ k }: { k: Kpis }) {
  return (
          <Secao
            titulo="Formação da margem"
            nota="O Protheus registra o desconto à parte — a receita bruta não o abate."
          >
            <Cascata
              parcelas={[
                { rotulo: "Receita bruta", valor: moeda(k.receita_bruta) },
                { rotulo: "Desconto", valor: moeda(k.desconto_total) },
                { rotulo: "Custo total", valor: moeda(k.custo_total) },
                {
                  rotulo: "Margem líquida",
                  valor: moeda(k.margem_liquida),
                  operador: "=",
                },
              ]}
            />
            <Nota>
              A margem bruta, antes do desconto, é {moeda(k.margem_bruta)} (
              {percentual(k.margem_pct)} da receita bruta). Depois do desconto de{" "}
              {moeda(k.desconto_total)}, a margem líquida é {moeda(k.margem_liquida)} (
              {percentual(k.margem_liquida_pct)} sobre {moeda(k.receita_liquida)} de
              receita líquida).
            </Nota>
          </Secao>
  );
}
