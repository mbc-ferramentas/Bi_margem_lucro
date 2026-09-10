import { ToggleGroup, ToggleGroupItem } from "@compartilhado/ui/atomos/toggle-group";

/** Alternador de uma escolha entre poucas — metrica de um ranking, modo de
 *  exibicao. Escolha unica: o grupo nunca fica vazio. */
export function Segmentado<T extends string>({
  valor,
  opcoes,
  aoMudar,
  rotulo,
  desabilitadas,
}: {
  valor: T;
  opcoes: readonly (readonly [T, string])[];
  aoMudar: (valor: T) => void;
  rotulo: string;
  /** Opcoes que existem mas nao cabem no estado atual — a granularidade diaria
   *  num recorte de um ano, por exemplo. Ficam apagadas em vez de sumir: a fila
   *  de botoes mudaria de tamanho a cada troca de periodo, e um botao que se move
   *  e mais confuso que um botao desabilitado. */
  desabilitadas?: readonly T[];
}) {
  return (
    <ToggleGroup
      value={[valor]}
      onValueChange={(seguinte) => {
        // Clicar no item ja marcado devolve lista vazia. Aqui isso nao e uma
        // opcao valida: sem metrica o grafico nao tem o que desenhar.
        const escolhido = (seguinte as T[])[0];
        if (escolhido) aoMudar(escolhido);
      }}
      variant="outline"
      size="sm"
      aria-label={rotulo}
    >
      {opcoes.map(([chave, texto]) => (
        <ToggleGroupItem
          key={chave}
          value={chave}
          disabled={desabilitadas?.includes(chave)}
        >
          {texto}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
