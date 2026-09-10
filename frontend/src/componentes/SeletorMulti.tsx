import { CheckIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@compartilhado/lib/utils";
import { Button } from "@compartilhado/ui/atomos/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@compartilhado/ui/atomos/command";
import { Popover, PopoverContent, PopoverTrigger } from "@compartilhado/ui/atomos/popover";
import { Label } from "@compartilhado/ui/atomos/label";

export type OpcaoMulti = {
  codigo: string;
  rotulo: string | null;
  /** So o grupo traz isso: item do cadastro sem linha no recorte atual. */
  sem_movimento?: boolean;
};

type Props = {
  /** Sufixo do id do campo — a mesma barra aparece em telas diferentes. */
  id: string;
  rotulo: string;
  /** Palavra usada no resumo e na busca ("3 grupos", "Buscar armazém…"). */
  substantivo: string;
  plural: string;
  opcoes: OpcaoMulti[] | undefined;
  valor: string[] | undefined;
  aoMudar: (codigos: string[]) => void;
};

/** Filtro de dimensao com multi-selecao — grupo e armazem.
 *
 *  Comparar "Ecommerce + Fabricacao propria" ou olhar dois barracoes lado a lado
 *  e leitura corriqueira, e um <select> de escolha unica obrigaria a uma tela por
 *  valor. A API ja aceita `?grupo=A,B` e `?armazem=01,02` (apps/api/filtros.py),
 *  entao a multi-selecao nao custa nada do lado do backend.
 *
 *  Menu suspenso e nao uma fila de botoes: as listas crescem conforme o Protheus,
 *  e deixar todos os valores visiveis empurraria o resto da barra de filtros para
 *  fora da tela. Fechado, o campo resume o que esta marcado.
 *
 *  Campo de busca porque a lista de grupos consolidados ja passa de vinte itens, e
 *  rolar procurando um codigo era o gesto mais lento da barra.
 *
 *  `sem_movimento` vem do cadastro e nao tem linha no recorte atual. Aparece assim
 *  mesmo — a lista tambem serve para conferir a classificacao — mas apagado, para
 *  ninguem marcar um deles e concluir que o BI zerou. */
export function SeletorMulti({
  id,
  rotulo,
  substantivo,
  plural,
  opcoes,
  valor,
  aoMudar,
}: Props) {
  const marcados = valor ?? [];

  function alternar(codigo: string) {
    aoMudar(
      marcados.includes(codigo)
        ? marcados.filter((c) => c !== codigo)
        : [...marcados, codigo],
    );
  }

  const rotuloDe = (codigo: string) =>
    opcoes?.find((o) => o.codigo === codigo)?.rotulo ?? codigo;

  // Fechado o campo precisa dizer o recorte sem depender de abrir: um nome
  // quando e um so, a contagem quando sao varios.
  const resumo =
    marcados.length === 0
      ? "Todos"
      : marcados.length === 1
        ? rotuloDe(marcados[0])
        : `${marcados.length} ${plural}`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-[11px] tracking-wider text-muted-foreground uppercase">
        {rotulo}
      </Label>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              size="sm"
              className="min-w-40 justify-between font-normal"
            >
              <span className="truncate">{resumo}</span>
              <ChevronDownIcon data-icon="inline-end" className="text-muted-foreground" />
            </Button>
          }
        />
        <PopoverContent align="start" className="w-64 p-0">
          <Command>
            <CommandInput placeholder={`Buscar ${substantivo}…`} />
            <CommandList>
              <CommandEmpty>Nenhum resultado.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="Todos" onSelect={() => aoMudar([])}>
                  <CheckIcon
                    className={cn("text-primary", marcados.length > 0 && "invisible")}
                  />
                  Todos
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                {opcoes?.map((o) => (
                  <CommandItem
                    key={o.codigo}
                    value={`${o.rotulo ?? o.codigo} ${o.codigo}`}
                    onSelect={() => alternar(o.codigo)}
                    className={cn(o.sem_movimento && "opacity-50")}
                    title={o.sem_movimento ? "Sem linhas no recorte atual" : undefined}
                  >
                    <CheckIcon
                      className={cn(
                        "text-primary",
                        !marcados.includes(o.codigo) && "invisible",
                      )}
                    />
                    {o.rotulo ?? o.codigo}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
