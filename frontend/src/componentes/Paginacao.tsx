import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/componentes/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/componentes/ui/select";
import { inteiro } from "../formato";

export const OPCOES_ITENS_POR_PAGINA = [25, 50, 100, 150, 200] as const;

type Propriedades = {
  total: number;
  offset: number;
  itensPorPagina: number;
  aoMudarOffset: (offset: number) => void;
  aoMudarItensPorPagina: (quantidade: number) => void;
};

export function Paginacao({
  total,
  offset,
  itensPorPagina,
  aoMudarOffset,
  aoMudarItensPorPagina,
}: Propriedades) {
  const inicio = total === 0 ? 0 : offset + 1;
  const fim = Math.min(offset + itensPorPagina, total);

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 pt-3.5">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Itens por página
        <Select
          value={String(itensPorPagina)}
          onValueChange={(valor) => aoMudarItensPorPagina(Number(valor))}
        >
          <SelectTrigger size="sm" aria-label="Itens por página">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {OPCOES_ITENS_POR_PAGINA.map((quantidade) => (
                <SelectItem key={quantidade} value={String(quantidade)}>
                  {quantidade}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>

      {/* role=status: quem navega por teclado precisa ouvir a faixa mudar sem
          ter que procurar o texto depois de clicar em "Próxima". */}
      <span className="num-tabular text-xs text-muted-foreground" role="status">
        {inteiro(inicio)}–{inteiro(fim)} de {inteiro(total)}
      </span>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={offset === 0}
          onClick={() => aoMudarOffset(Math.max(0, offset - itensPorPagina))}
        >
          <ChevronLeftIcon data-icon="inline-start" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={offset + itensPorPagina >= total}
          onClick={() => aoMudarOffset(offset + itensPorPagina)}
        >
          Próxima
          <ChevronRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}
