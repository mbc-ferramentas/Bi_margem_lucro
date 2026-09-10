import { ChevronDownIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@compartilhado/ui/atomos/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@compartilhado/ui/atomos/dropdown-menu";
import { useTema } from "@compartilhado/lib/tema";
import type { Tema } from "@compartilhado/lib/tema";

const OPCOES: { valor: Tema; rotulo: string; Icone: typeof SunIcon }[] = [
  { valor: "sistema", rotulo: "Sistema", Icone: MonitorIcon },
  { valor: "claro", rotulo: "Claro", Icone: SunIcon },
  { valor: "escuro", rotulo: "Escuro", Icone: MoonIcon },
];

/** Escolha de tema. Fica no cabecalho de cada pagina, e nao na barra lateral,
 *  por pedido do usuario.
 *
 *  Um menu, e nao tres botoes lado a lado: no cabecalho o titulo da pagina ja
 *  disputa a linha, e no celular os tres botoes empurravam o titulo para baixo.
 *  O gatilho mostra o icone do modo que esta valendo — inclusive o "sistema",
 *  que e uma resposta diferente de "claro" mesmo quando pinta igual.
 *
 *  `secondary` + chevron, e nao `outline`: no modo claro o `outline` pinta
 *  bg-background sobre uma pagina de bg-background, e a borda fica em 1.2:1
 *  contra ela — o gatilho lia como texto solto no cabecalho e o usuario nao
 *  percebia que dava para clicar. O chevron e o sinal de "isto abre um menu". */
export function SeletorTema() {
  const { tema, definirTema } = useTema();
  const atual = OPCOES.find((o) => o.valor === tema) ?? OPCOES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="secondary" size="sm" aria-label={`Tema: ${atual.rotulo}`}>
            <atual.Icone data-icon="inline-start" />
            <span className="max-sm:sr-only">{atual.rotulo}</span>
            <ChevronDownIcon className="text-muted-foreground" data-icon="inline-end" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuRadioGroup
            value={tema}
            onValueChange={(valor) => definirTema(valor as Tema)}
          >
            {OPCOES.map(({ valor, rotulo, Icone }) => (
              <DropdownMenuRadioItem key={valor} value={valor}>
                <Icone data-icon="inline-start" />
                {rotulo}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
