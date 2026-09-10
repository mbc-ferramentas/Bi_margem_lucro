import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@compartilhado/ui/atomos/progress";
import type { Tom } from "@compartilhado/ui/tom";

const TRILHO_COMPOSICAO: Record<"info" | Exclude<Tom, "neutro">, string> = {
  info: "bg-primary",
  bom: "bg-status-bom",
  atencao: "bg-status-atencao",
  critico: "bg-status-critico",
};

export function BarraComposicao({
  valor,
  rotulo,
  detalhe,
  tom = "critico",
}: {
  valor: number;
  rotulo: string;
  detalhe: string;
  tom?: "info" | Exclude<Tom, "neutro">;
}) {
  // Limitar aqui e nao no chamador: a fracao vem de uma divisao com o total no
  // denominador, e um total zerado devolve NaN ou Infinity.
  const limitado = Math.max(0, Math.min(1, Number.isFinite(valor) ? valor : 0));
  return (
    <div className="py-3.5">
      <div className="mb-2 flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{rotulo}</span>
        <strong className="text-foreground">{detalhe}</strong>
      </div>
      <Progress value={limitado * 100} aria-label={rotulo} className="block">
        <ProgressTrack className="h-2.5">
          <ProgressIndicator className={TRILHO_COMPOSICAO[tom]} />
        </ProgressTrack>
      </Progress>
    </div>
  );
}
