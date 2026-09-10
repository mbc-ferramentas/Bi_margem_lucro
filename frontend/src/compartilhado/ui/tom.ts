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

