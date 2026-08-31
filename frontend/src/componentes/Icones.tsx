/** Icones SVG inline.
 *
 *  O projeto nao carrega biblioteca de icones: sao poucos, e cada um custa menos
 *  escrito a mao do que um pacote inteiro no bundle. Mesmo desenho do seletor de
 *  tema — `currentColor` e `aria-hidden`, porque o rotulo em texto e que carrega
 *  o significado.
 */

export function IconeOlho() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path
        d="M8 3.2c-3 0-5.4 2.2-6.4 4.8 1 2.6 3.4 4.8 6.4 4.8s5.4-2.2 6.4-4.8C13.4 5.4 11 3.2 8 3.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
