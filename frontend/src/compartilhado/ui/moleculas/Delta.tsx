import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";

import { cn } from "@compartilhado/lib/utils";

/** Variacao contra o periodo anterior.
 *
 *  Tres decisoes que nao sao estilo:
 *
 *  1. **Seta + sinal + texto.** A cor nunca carrega o significado sozinha — em
 *     modo claro o verde de status fica abaixo de 3:1 sobre o cartao, e ha quem
 *     nao distinga verde de vermelho em nenhum contraste.
 *  2. **Ponto percentual para taxa, percentual para valor.** Margem que sobe de
 *     24% para 26% subiu 2 p.p., nao 2%; trocar as duas unidades e o jeito mais
 *     comum de um painel mentir.
 *  3. **`inverter` para custo e desconto.** Subir e ruim la, e pintar de verde
 *     um custo que cresceu seria pior do que nao pintar nada.
 *
 *  Base zerada nao vira variacao infinita: sem denominador, so o texto do
 *  periodo aparece. */
export function Delta({
  atual,
  anterior,
  formato = "percentual",
  inverter = false,
  referencia,
}: {
  atual: number | null;
  anterior: number | null;
  formato?: "percentual" | "pontos";
  inverter?: boolean;
  /** Rotulo da janela comparada, ex.: "03/2026 a 06/2026". */
  referencia?: string | null;
}) {
  if (atual === null || anterior === null || !Number.isFinite(atual) || !Number.isFinite(anterior)) {
    return null;
  }

  const bruto = formato === "pontos" ? (atual - anterior) * 100 : anterior === 0 ? null : (atual - anterior) / Math.abs(anterior);
  if (bruto === null || !Number.isFinite(bruto)) return null;

  // Meio ponto percentual de variacao em um faturamento de milhoes e ruido de
  // arredondamento, nao noticia: abaixo disso a leitura e "estavel".
  const estavel = Math.abs(bruto) < (formato === "pontos" ? 0.05 : 0.001);
  const melhorou = inverter ? bruto < 0 : bruto > 0;
  const Icone = estavel ? ArrowRightIcon : bruto > 0 ? ArrowUpRightIcon : ArrowDownRightIcon;

  const sinal = bruto > 0 ? "+" : "";
  const texto =
    formato === "pontos"
      ? `${sinal}${bruto.toFixed(1).replace(".", ",")} p.p.`
      : `${sinal}${(bruto * 100).toFixed(1).replace(".", ",")}%`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs leading-4",
        estavel ? "text-muted-foreground" : melhorou ? "text-delta-bom" : "text-destructive",
      )}
    >
      <Icone className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {estavel ? "estável" : texto}
        {referencia && <span className="text-muted-foreground"> vs {referencia}</span>}
      </span>
    </span>
  );
}
