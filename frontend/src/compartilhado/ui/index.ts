/** A porta de entrada do kit visual.
 *
 *  As paginas importam daqui, e nao do arquivo de cada componente: o caminho
 *  interno (molecula ou organismo) e classificacao nossa e pode mudar sem que
 *  13 telas precisem ser reescritas. O que e contrato sao estes nomes.
 *
 *  `atomos/` fica de fora de proposito — e territorio vendorizado do shadcn,
 *  atualizado por `npx shadcn@latest add <item> --diff`, e cada tela importa o
 *  atomo que usa pelo caminho direto. */

export { FAIXA_TOM, type Tom } from "./tom";

export { Abas } from "./moleculas/Abas";
export { Badge } from "./moleculas/Badge";
export { BarraComposicao } from "./moleculas/BarraComposicao";
export { CartaoDestaque } from "./moleculas/CartaoDestaque";
export { CartaoKpi } from "./moleculas/CartaoKpi";
export { Delta } from "./moleculas/Delta";
export { AvisoMarketplace, Erro, Vazio } from "./moleculas/Estados";
export { GradeInsights, GradeKpis } from "./moleculas/Grades";
export { Nota } from "./moleculas/Nota";
export { Secao } from "./moleculas/Secao";
export { Segmentado } from "./moleculas/Segmentado";

export { Cascata } from "./organismos/Cascata";
export { PainelInsight } from "./organismos/PainelInsight";
