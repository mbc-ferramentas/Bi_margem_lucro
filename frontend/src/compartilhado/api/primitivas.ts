/** O vocabulario com que esta API serializa numeros, e o envelope de escopo que
 *  acompanha toda resposta de BI.
 *
 *  Fica no transporte, e nao numa entidade, porque as sete entidades usam os
 *  mesmos tres tipos — se `dinheiro` morasse em `margem`, `pedido` teria de
 *  importar de `margem` para validar um total, e uma entidade nao conhece
 *  outra. */

import { z } from "zod";

/** Valores monetarios chegam como string: a API serializa Decimal como texto
 *  para nao perder centavos em float. Converta so na exibicao. */
export const dinheiro = z.string().nullable();
export const numero = z.union([z.string(), z.number()]).nullable();
/** Contagens sao inteiras, mas sum() no Postgres devolve numeric — que o renderer
 *  serializa como texto. Aceita as duas formas e entrega number. */
export const contagem = z.coerce.number();

export const escopoSchema = z.object({
  tipo: z.literal("margem_bruta"),
  rotulo: z.string(),
  formula: z.string(),
  nao_inclui: z.array(z.string()),
  aviso_marketplace: z.string(),
  comparacao_entre_canais: z.literal(false),
});
export type Escopo = z.infer<typeof escopoSchema>;

/** Mensagem simples da API ({"detail": "..."}), sem corpo de dominio. */
export const detalheSchema = z.object({ detail: z.string() });
