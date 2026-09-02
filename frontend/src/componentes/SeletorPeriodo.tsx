import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

import { Button } from "@/componentes/ui/button";
import { Calendar } from "@/componentes/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/componentes/ui/popover";
import { Label } from "@/componentes/ui/label";
import { Separator } from "@/componentes/ui/separator";
import { intervaloData } from "../formato";

type Props = {
  /** Sufixo do id do campo — a mesma barra aparece em telas diferentes. */
  id?: string;
  inicio?: string;
  fim?: string;
  aoMudar: (periodo: { inicio?: string; fim?: string }) => void;
  /** Extremos do que existe na base (`opcoes.periodo` de `/filtros`). Limitam o
   *  calendario: nao ha por que deixar navegar ate 2019 se o dado comeca em
   *  2026. */
  base?: { inicio: string | null; fim: string | null } | null;
};

/** As datas trafegam em ISO (AAAA-MM-DD) e o calendario trabalha com `Date`. A
 *  conversao e sempre pelo meio-dia local: `new Date("2026-07-01")` e UTC e, em
 *  BRT, volta para 30/06 — o usuario clicava num dia e o filtro ia no anterior. */
function paraData(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia, 12);
}

function paraIso(data?: Date): string | undefined {
  if (!data) return undefined;
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

function somarDias(data: Date, dias: number): Date {
  const seguinte = new Date(data);
  seguinte.setDate(seguinte.getDate() + dias);
  return seguinte;
}

/** Atalhos ancorados em **hoje**, nao no ultimo dia da base: o usuario pensa em
 *  "os ultimos 30 dias", e se a carga esta atrasada isso e uma informacao — o
 *  periodo aparece vazio e ele vai atras do ETL, em vez de olhar um numero velho
 *  achando que e o de hoje. */
const ATALHOS: readonly (readonly [string, () => { inicio: Date; fim: Date }])[] = [
  [
    "Mês atual",
    () => {
      const hoje = new Date();
      return { inicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1), fim: hoje };
    },
  ],
  [
    "Mês passado",
    () => {
      const hoje = new Date();
      return {
        inicio: new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1),
        fim: new Date(hoje.getFullYear(), hoje.getMonth(), 0),
      };
    },
  ],
  ["Últimos 30 dias", () => ({ inicio: somarDias(new Date(), -29), fim: new Date() })],
  ["Últimos 90 dias", () => ({ inicio: somarDias(new Date(), -89), fim: new Date() })],
  [
    "Este ano",
    () => ({ inicio: new Date(new Date().getFullYear(), 0, 1), fim: new Date() }),
  ],
];

/** Filtro de periodo: um intervalo de datas, como em qualquer outro sistema.
 *
 *  Antes eram dois selects de competencia, e o recorte so podia ser um mes
 *  inteiro — perguntar "como foi a primeira quinzena?" nao tinha resposta na
 *  tela. As datas saem daqui em ISO e recortam `emissao` nas telas de margem e
 *  `dt_entrega` na carteira (apps/api/views.py).
 *
 *  O calendario abre com dois meses lado a lado porque a comparacao mais comum
 *  atravessa a virada do mes, e os atalhos cobrem o que se pede todo dia sem
 *  obrigar a caçar dois cliques no calendario. */
export function SeletorPeriodo({ id = "f-periodo", inicio, fim, aoMudar, base }: Props) {
  const [aberto, setAberto] = useState(false);

  const intervalo: DateRange | undefined =
    inicio || fim ? { from: paraData(inicio), to: paraData(fim) } : undefined;

  function definir(seguinte: DateRange | undefined) {
    aoMudar({ inicio: paraIso(seguinte?.from), fim: paraIso(seguinte?.to) });
  }

  const rotulo = intervaloData(inicio, fim) ?? "Todo o período";
  const limite = {
    inicio: paraData(base?.inicio ?? undefined),
    fim: paraData(base?.fim ?? undefined),
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor={id}
        className="text-[11px] tracking-wider text-muted-foreground uppercase"
      >
        Período
      </Label>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              size="sm"
              className="min-w-56 justify-between font-normal"
            >
              <span className="truncate">{rotulo}</span>
              <CalendarIcon data-icon="inline-end" className="text-muted-foreground" />
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto gap-0 p-0">
          <div className="flex flex-wrap gap-1 p-2">
            {ATALHOS.map(([texto, calcular]) => (
              <Button
                key={texto}
                type="button"
                variant="ghost"
                size="sm"
                className="font-normal"
                onClick={() => {
                  const { inicio: de, fim: ate } = calcular();
                  definir({ from: de, to: ate });
                  setAberto(false);
                }}
              >
                {texto}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="font-normal"
              onClick={() => {
                definir(undefined);
                setAberto(false);
              }}
            >
              Todo o período
            </Button>
          </div>
          <Separator />
          <Calendar
            mode="range"
            numberOfMonths={2}
            locale={ptBR}
            selected={intervalo}
            defaultMonth={paraData(inicio) ?? limite.fim}
            startMonth={limite.inicio}
            endMonth={limite.fim}
            onSelect={definir}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
