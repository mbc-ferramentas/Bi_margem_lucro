import { expect, type Page } from "@playwright/test";

// O SPA de dev chama a API em VITE_API_URL (http://localhost:8000), que e o
// endereco do HOST. De dentro do container do Playwright esse localhost e o
// proprio container — entao cada chamada e reencaminhada para o servico da API
// na rede do compose. Sem isso a tela carrega vazia e o print "passa" mentindo.
const API = process.env.E2E_API_URL ?? "http://bi-margem-lucro-api:8000";

export async function redirecionarApi(page: Page) {
  await page.route(/^https?:\/\/(localhost|127\.0\.0\.1):8000\//, async (rota) => {
    const original = new URL(rota.request().url());
    const resposta = await rota.fetch({ url: API + original.pathname + original.search });
    await rota.fulfill({
      response: resposta,
      headers: { ...resposta.headers(), "access-control-allow-origin": "*" },
    });
  });
}

/** Fixa o tema: sem isso o print depende do prefers-color-scheme da execucao. */
export async function fixarTema(page: Page, tema: "claro" | "escuro") {
  await page.addInitScript((t) => localStorage.setItem("bi.tema", t), tema);
}

/** Espera a tela assentar: rede ociosa e nenhum spinner/skeleton na tela. */
export async function aguardarTela(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[data-slot="skeleton"], [data-slot="spinner"]')).toHaveCount(0, {
    timeout: 20_000,
  });
  // O ECharts anima a entrada mesmo com animations: "disabled" (e SVG
  // desenhado por JS, nao transicao CSS): espera a animacao padrao de 1s.
  await page.waitForTimeout(1_200);
}
