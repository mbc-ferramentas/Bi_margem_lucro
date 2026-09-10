import { useOpcoes } from "../api/hooks";
import type { Filtros } from "../api/tipos";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@compartilhado/ui/atomos/select";
import { Label } from "@compartilhado/ui/atomos/label";
import { SeletorMulti } from "./SeletorMulti";
import { SeletorPeriodo } from "./SeletorPeriodo";
import { ChipsFiltros } from "@widgets/barra-filtros/ChipsFiltros";

type Props = {
  valor: Filtros;
  aoMudar: (f: Filtros) => void;
  /** O ranking de vendedor ja e restrito a venda interna: o seletor de canal
   *  nao faz sentido la. */
  ocultarCanal?: boolean;
  /** Na lista de pedidos o armazem vem da rota: um select que discordasse da URL
   *  daria duas verdades para o mesmo recorte. */
  ocultarArmazem?: boolean;
  /** Mesma razao do armazem, na outra metade do drill-down: o vendedor da rota
   *  ja trava o recorte. */
  ocultarVendedor?: boolean;
};

/** Sentinela do "sem filtro". O Select do Base UI trata "" como ausencia de
 *  valor e cai no placeholder, entao a opcao "Todos" precisa de um valor
 *  proprio — que nunca chega a API.
 *
 *  Ela e so o valor interno: o `Select.Value` do Base UI imprime o valor cru
 *  quando nao recebe uma funcao de formatacao, e era assim que o "__todos__"
 *  vazava para a tela. Por isso todo
 *  `SelectValue` daqui recebe um rotulo explicito. */
const TODOS = "__todos__";

/** Rotulo do campo fechado: a sentinela vira o texto da opcao "Todos", e o resto
 *  passa pelo mesmo formatador da lista. */
function rotuloSelecao(vazio: string, formatar: (valor: string) => string) {
  return (valor: unknown) =>
    !valor || valor === TODOS ? vazio : formatar(String(valor));
}

const ROTULO = "text-[11px] tracking-wider text-muted-foreground uppercase";

function Campo({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}

export function BarraFiltros({
  valor,
  aoMudar,
  ocultarCanal,
  ocultarArmazem,
  ocultarVendedor,
}: Props) {
  // As opcoes vem recortadas pelos filtros ativos: escolher um armazem reduz a
  // lista de grupos aos que existem nele. Por isso o proprio `valor` entra aqui.
  const { data } = useOpcoes(valor);
  const opcoes = data?.opcoes;

  // O Base UI devolve `null` quando a selecao e limpa; para a API isso e a
  // mesma coisa que a sentinela "Todos": o filtro simplesmente nao vai.
  function definir(chave: keyof Filtros) {
    return (escolhido: string | null) =>
      aoMudar({
        ...valor,
        [chave]: !escolhido || escolhido === TODOS ? undefined : escolhido,
      });
  }

  // A API chama de `nome` o que o seletor le como `rotulo`: o mesmo campo com
  // dois nomes, e nao vale um tipo novo so por isso.
  const vendedores = opcoes?.vendedores.map((v) => ({
    codigo: v.codigo,
    rotulo: v.nome,
  }));

  // Trocar de armazem pode deixar o grupo escolhido fora do recorte novo. Manter
  // o grupo antigo devolveria tela vazia sem explicar por que.
  function definirArmazem(armazens: string[]) {
    aoMudar({ ...valor, armazem: armazens, grupo: [] });
  }

  return (
    <div className="mb-4 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-end gap-2.5">
        <SeletorPeriodo
          inicio={valor.data_inicio}
          fim={valor.data_fim}
          base={opcoes?.periodo}
          aoMudar={({ inicio, fim }) =>
            aoMudar({ ...valor, data_inicio: inicio, data_fim: fim })
          }
        />

        {!ocultarCanal && (
          <Campo>
            <Label htmlFor="f-canal" className={ROTULO}>
              Canal
            </Label>
            <Select value={valor.canal ?? TODOS} onValueChange={definir("canal")}>
              <SelectTrigger id="f-canal" size="sm" className="min-w-32">
                <SelectValue>{rotuloSelecao("Todos", (c) => c)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {opcoes?.canais.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Campo>
        )}

        {/* Armazem antes de grupo: a ordem na barra e a hierarquia da analise. */}
        {!ocultarArmazem && (
          <SeletorMulti
            id="f-armazem"
            rotulo="Armazém"
            substantivo="armazém"
            plural="armazéns"
            opcoes={opcoes?.armazens}
            valor={valor.armazem}
            aoMudar={definirArmazem}
          />
        )}

        <SeletorMulti
          id="f-grupo"
          rotulo="Grupo"
          substantivo="grupo"
          plural="grupos"
          opcoes={opcoes?.grupos}
          valor={valor.grupo}
          aoMudar={(grupos) => aoMudar({ ...valor, grupo: grupos })}
        />

        {/* Vendedor depois do grupo: e um recorte de quem vendeu, nao um nivel da
            hierarquia armazem > grupo. A lista ja chega restrita ao escopo do
            usuario — um vendedor nao enxerga os colegas nem aqui. */}
        {!ocultarVendedor && (
          <SeletorMulti
            id="f-vendedor"
            rotulo="Vendedores"
            substantivo="vendedor"
            plural="vendedores"
            opcoes={vendedores}
            valor={valor.vendedor}
            aoMudar={(codigos) => aoMudar({ ...valor, vendedor: codigos })}
          />
        )}
      </div>

      <ChipsFiltros valor={valor} aoMudar={aoMudar} />
    </div>
  );
}
