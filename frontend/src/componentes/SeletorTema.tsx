import { useTema } from "../tema";
import type { Tema } from "../tema";

/** Icones inline: um SVG de 14px nao justifica uma dependencia de pacote, e em
 *  currentColor eles seguem a cor do botao nos dois modos sem regra extra. */
const ICONES: Record<Tema, JSX.Element> = {
  sistema: (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="9"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M5.5 14h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  claro: (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  ),
  escuro: (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path
        d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

const OPCOES: { valor: Tema; rotulo: string }[] = [
  { valor: "sistema", rotulo: "Sistema" },
  { valor: "claro", rotulo: "Claro" },
  { valor: "escuro", rotulo: "Escuro" },
];

/** Escolha de tema. Fica no cabecalho de cada pagina, e nao na barra lateral,
 *  por pedido do usuario. */
export function SeletorTema() {
  const { tema, definirTema } = useTema();

  return (
    <div className="seletor-tema" role="radiogroup" aria-label="Tema">
      {OPCOES.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={tema === o.valor}
          // O rotulo textual some no layout estreito (media query em
          // styles.css), entao o nome acessivel nao pode depender dele.
          aria-label={o.rotulo}
          title={o.rotulo}
          onClick={() => definirTema(o.valor)}
        >
          {ICONES[o.valor]}
          <span>{o.rotulo}</span>
        </button>
      ))}
    </div>
  );
}
