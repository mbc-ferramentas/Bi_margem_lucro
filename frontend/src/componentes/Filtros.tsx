import { useOpcoes } from "../api/hooks";
import type { Filtros } from "../api/tipos";
import { competencia } from "../formato";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/componentes/ui/select";
import { Label } from "@/componentes/ui/label";
import { SeletorMulti } from "./SeletorMulti";
import { ChipsFiltros } from "./Visual";

type Props = {
  valor: Filtros;
  aoMudar: (f: Filtros) => void;
  /** O ranking de vendedor ja e restrito a venda interna: o seletor de canal
   *  nao faz sentido la. */
  ocultarCanal?: boolean;
  /** Na lista de pedidos o armazem vem da rota: um select que discordasse da URL
   *  daria duas verdades para o mesmo recorte. */
  ocultarArmazem?: boolean;
};

/** Sentinela do "sem filtro". O Select do Base UI trata "" como ausencia de
 *  valor e cai no placeholder, entao a opcao "Todos" precisa de um valor
 *  proprio — que nunca chega a API.
 *
 *  Ela e so o valor interno: o `Select.Value` do Base UI imprime o valor cru
 *  quando nao recebe uma funcao de formatacao, e era assim que o "__todos__"
 *  vazava para a tela (junto com a competencia em AAAA-MM). Por isso todo
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

export function BarraFiltros({ valor, aoMudar, ocultarCanal, ocultarArmazem }: Props) {
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

  // Trocar de armazem pode deixar o grupo escolhido fora do recorte novo. Manter
  // o grupo antigo devolveria tela vazia sem explicar por que.
  function definirArmazem(armazens: string[]) {
    aoMudar({ ...valor, armazem: armazens, grupo: [] });
  }

  // As competencias sao AAAA-MM zero-padded: comparar como string ja ordena por
  // data, o que basta para bloquear um intervalo invertido antes do 400 da API.
  const inicio = valor.competencia_inicio ?? "";
  const fim = valor.competencia_fim ?? "";

  return (
    <div className="mb-4 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-end gap-2.5">
        <Campo>
          <span className={ROTULO}>Período</span>
          <div className="flex items-center gap-1.5" role="group" aria-label="Período">
            <Select
              value={inicio || TODOS}
              onValueChange={definir("competencia_inicio")}
            >
              <SelectTrigger size="sm" aria-label="Competência inicial">
                <SelectValue>{rotuloSelecao("Início", competencia)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={TODOS}>Início</SelectItem>
                  {opcoes?.competencias.map((c) => (
                    <SelectItem
                      key={c}
                      value={c.slice(0, 7)}
                      disabled={!!fim && c.slice(0, 7) > fim}
                    >
                      {competencia(c)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">até</span>
            <Select value={fim || TODOS} onValueChange={definir("competencia_fim")}>
              <SelectTrigger size="sm" aria-label="Competência final">
                <SelectValue>{rotuloSelecao("Fim", competencia)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={TODOS}>Fim</SelectItem>
                  {opcoes?.competencias.map((c) => (
                    <SelectItem
                      key={c}
                      value={c.slice(0, 7)}
                      disabled={!!inicio && c.slice(0, 7) < inicio}
                    >
                      {competencia(c)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </Campo>

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
      </div>

      <ChipsFiltros valor={valor} aoMudar={aoMudar} />
    </div>
  );
}
