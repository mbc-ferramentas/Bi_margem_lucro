import { cn } from "@compartilhado/lib/utils";
import type { Tom } from "@compartilhado/ui/tom";

const BORDA_INSIGHT: Record<Tom, string> = {
  neutro: "border-l-axis",
  bom: "border-l-status-bom",
  atencao: "border-l-status-atencao",
  critico: "border-l-status-critico",
};

export function PainelInsight({
  titulo,
  valor,
  texto,
  tom = "neutro",
}: {
  titulo: string;
  valor?: string;
  texto: string;
  tom?: Tom;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border-l-[3px] bg-card px-3.5 py-3 text-xs text-muted-foreground ring-1 ring-foreground/10",
        BORDA_INSIGHT[tom],
      )}
    >
      <span className="text-[10.5px] tracking-wider text-muted-foreground uppercase">{titulo}</span>
      {valor && <strong className="text-base text-foreground">{valor}</strong>}
      <span>{texto}</span>
    </div>
  );
}
