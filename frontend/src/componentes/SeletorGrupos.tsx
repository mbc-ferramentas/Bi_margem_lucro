import { CheckIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/componentes/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/componentes/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/componentes/ui/popover";
import { Label } from "@/componentes/ui/label";

type Opcao = { codigo: string; rotulo: string | null; sem_movimento: boolean };

type Props = {
  opcoes: Opcao[] | undefined;
  valor: string[] | undefined;
  aoMudar: (grupos: string[]) => void;
  /** Prefixo dos ids: a mesma barra aparece em telas diferentes. */
  idPrefixo: string;
};

/** Grupo e a unica dimensao com multi-selecao: comparar "Ecommerce + Fabricacao
 *  propria" ou olhar so os grupos de consumo interno e leitura corriqueira, e um
 *  <select> obrigaria a uma tela por grupo.
 *
 *  Menu suspenso e nao uma fila de botoes: a lista de grupos cresce conforme o
 *  Protheus, e deixar todos visiveis empurraria o resto da barra de filtros para
 *  fora da tela. Fechado, o campo resume o que esta marcado.
 *
 *  Ganhou campo de busca ao virar Command: com os grupos consolidados a lista ja
 *  passa de vinte itens, e rolar procurando um codigo era o gesto mais lento da
 *  barra de filtros.
 *
 *  Os grupos `sem_movimento` vem do cadastro e nao tem linha no recorte atual.
 *  Aparecem assim mesmo — a lista tambem serve para conferir a classificacao —
 *  mas apagados, para ninguem marcar um deles e concluir que o BI zerou. */
export function SeletorGrupos({ opcoes, valor, aoMudar, idPrefixo }: Props) {
  const marcados = valor ?? [];

  function alternar(codigo: string) {
    aoMudar(
      marcados.includes(codigo)
        ? marcados.filter((c) => c !== codigo)
        : [...marcados, codigo],
    );
  }

  const rotuloDe = (codigo: string) =>
    opcoes?.find((g) => g.codigo === codigo)?.rotulo ?? codigo;

  // Fechado o campo precisa dizer o recorte sem depender de abrir: um nome
  // quando e um so, a contagem quando sao varios.
  const resumo =
    marcados.length === 0
      ? "Todos"
      : marcados.length === 1
        ? rotuloDe(marcados[0])
        : `${marcados.length} grupos`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${idPrefixo}-grupo`} className="text-[11px] tracking-wider text-muted-foreground uppercase">
        Grupo
      </Label>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              id={`${idPrefixo}-grupo`}
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
            <CommandInput placeholder="Buscar grupo…" />
            <CommandList>
              <CommandEmpty>Nenhum grupo encontrado.</CommandEmpty>
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
                {opcoes?.map((g) => (
                  <CommandItem
                    key={g.codigo}
                    value={`${g.rotulo ?? g.codigo} ${g.codigo}`}
                    onSelect={() => alternar(g.codigo)}
                    className={cn(g.sem_movimento && "opacity-50")}
                    title={g.sem_movimento ? "Sem linhas no recorte atual" : undefined}
                  >
                    <CheckIcon
                      className={cn(
                        "text-primary",
                        !marcados.includes(g.codigo) && "invisible",
                      )}
                    />
                    {g.rotulo ?? g.codigo}
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
