/** O vocabulario de gravidade do BI, compartilhado pelos cartoes e paineis.
 *
 *  Fica num modulo proprio porque quatro componentes de arquivos diferentes
 *  precisam do mesmo conjunto: se cada um declarasse o seu, "atencao" poderia
 *  significar duas cores. */

export type Tom = "neutro" | "bom" | "atencao" | "critico";

/** As cores de status sao reservadas: nunca viram "serie 6". E como no modo
 *  claro atencao e serio ficam abaixo de 3:1 por construcao, elas sempre andam
 *  acompanhadas do rotulo do KPI — nunca sozinhas. */
export const FAIXA_TOM: Record<Tom, string> = {
  neutro: "bg-axis",
  bom: "bg-status-bom",
  atencao: "bg-status-atencao",
  critico: "bg-status-critico",
};


/** Lavagem de fundo do cartao: a mesma cor da faixa, quase apagada, descendo do
 *  topo. E acabamento, nao codificacao — a opacidade e baixa de proposito para
 *  nao alterar o contraste do texto sobre o cartao, e o tom continua sendo lido
 *  pela faixa e pelo rotulo. */
export const LAVAGEM_TOM: Record<Tom, string> = {
  neutro: "",
  bom: "bg-linear-to-b from-status-bom/[0.07] to-transparent to-40%",
  atencao: "bg-linear-to-b from-status-atencao/[0.09] to-transparent to-40%",
  critico: "bg-linear-to-b from-status-critico/[0.07] to-transparent to-40%",
};
