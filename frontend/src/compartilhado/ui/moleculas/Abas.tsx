import { Badge as BadgeUi } from "@compartilhado/ui/atomos/badge";
import { Tabs, TabsList, TabsTrigger } from "@compartilhado/ui/atomos/tabs";

export function Abas<T extends string>({
  valor,
  opcoes,
  aoMudar,
  rotulo = "Seções da página",
}: {
  valor: T;
  opcoes: readonly { valor: T; rotulo: string; contador?: number }[];
  aoMudar: (valor: T) => void;
  rotulo?: string;
}) {
  return (
    <Tabs
      value={valor}
      onValueChange={(seguinte) => aoMudar(seguinte as T)}
      className="mb-4"
    >
      {/* activateOnFocus: o Base UI vem com ativacao manual (seta move o foco,
          Enter confirma). Aqui o conteudo da aba ja esta montado e a troca e
          barata, entao a seta troca direto — e o comportamento que as telas
          tinham antes do redesign. */}
      <TabsList
        variant="line"
        activateOnFocus
        aria-label={rotulo}
        className="border-b border-border"
      >
        {opcoes.map((opcao) => (
          <TabsTrigger key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
            {opcao.contador !== undefined && (
              <BadgeUi variant="secondary" className="ml-1.5">
                {opcao.contador}
              </BadgeUi>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
