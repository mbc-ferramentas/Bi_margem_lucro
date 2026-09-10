import { cn } from "@compartilhado/lib/utils";

const COLUNAS_KPI = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 xl:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
} as const;

/** Grade dos KPIs do topo. Quatro colunas na tela cheia, duas no tablet, uma no
 *  celular — um KPI espremido a um terco de largura corta o numero, que e a
 *  unica coisa que ele tem para dizer.
 *
 *  `colunas` existe para os blocos que nao tem quatro cartoes: com o padrao,
 *  tres cartoes se espalhavam numa grade de quatro e o ultimo ficava orfao.
 *  `margem` sai do caminho quando a grade esta dentro de outra grade. */
export function GradeKpis({
  children,
  colunas = 4,
  margem = true,
}: {
  children: React.ReactNode;
  colunas?: keyof typeof COLUNAS_KPI;
  margem?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3",
        COLUNAS_KPI[colunas],
        margem && "mb-4",
      )}
    >
      {children}
    </div>
  );
}

export function GradeInsights({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3.5 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
      {children}
    </div>
  );
}
