/** O recorte que toda consulta de BI carrega.
 *
 *  Mora no transporte porque e o que `paraQuery` serializa e o que todo hook
 *  recebe. Nao confundir com `filtrosSchema`, na entidade `filtros`: aquele e a
 *  resposta do endpoint que lista as opcoes disponiveis. */

export type Filtros = {
  /** Intervalo de datas em ISO (AAAA-MM-DD), inclusivo nas duas pontas. Nas
   *  telas de margem recorta a **emissao**; na carteira, a **data de entrega** —
   *  a view nao tem competencia, e o que interessa la e o prazo prometido. */
  data_inicio?: string;
  data_fim?: string;
  canal?: string;
  /** Multi-selecao: grupo, armazem e vendedor sao marcadores, nao selects de
   *  escolha unica. Vazio = todos. A API aceita `?grupo=A,B`, `?armazem=01,02` e
   *  `?vendedor=01,02` desde sempre (apps/api/filtros.py). */
  grupo?: string[];
  armazem?: string[];
  vendedor?: string[];
  /** Exclusivos da carteira. */
  situacao?: "atrasados" | "a_vencer";
  busca?: string;
};
