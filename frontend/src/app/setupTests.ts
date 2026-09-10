/** Polyfills que o jsdom nao implementa e os primitivos do Base UI exigem.
 *
 *  Sem eles o teste nao falha com uma mensagem util: quebra dentro do
 *  componente, num `undefined is not a function`, em qualquer tela que abra um
 *  menu, um dialogo ou o proprio menu lateral.
 */

import "@testing-library/jest-dom/vitest";

if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (consulta: string) => ({
      matches: false,
      media: consulta,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Captura de ponteiro: usada pelo Select e pelo Slider ao arrastar.
for (const metodo of [
  "hasPointerCapture",
  "setPointerCapture",
  "releasePointerCapture",
  "scrollIntoView",
] as const) {
  if (typeof (Element.prototype as unknown as Record<string, unknown>)[metodo] !== "function") {
    Object.defineProperty(Element.prototype, metodo, { value: () => {}, writable: true });
  }
}
