import { expect, test } from "@playwright/test";

import { aguardarTela, fixarTema, redirecionarApi } from "./apoio";

// Cada tela vira um print comparado contra o baseline em __prints__/. Se a
// mudanca foi intencional, rode `make e2e-atualizar` e revise a imagem nova no
// diff do git antes de commitar — e ali que se confirma que ela aconteceu.
const telas = [
  { nome: "visao-geral", rota: "/" },
  { nome: "armazens", rota: "/armazens" },
  { nome: "vendedores", rota: "/vendedores" },
  { nome: "skus", rota: "/skus" },
  { nome: "canais", rota: "/canais" },
  { nome: "carteira", rota: "/carteira" },
  { nome: "uploads", rota: "/uploads" },
  { nome: "usuarios", rota: "/usuarios" },
];

for (const tema of ["claro", "escuro"] as const) {
  test.describe(`tema ${tema}`, () => {
    test.beforeEach(async ({ page }) => {
      await redirecionarApi(page);
      await fixarTema(page, tema);
    });

    for (const { nome, rota } of telas) {
      test(nome, async ({ page }, info) => {
        await page.goto(rota);
        await expect(page).not.toHaveURL(/\/login/);
        await aguardarTela(page);

        // Evidencia sempre anexada ao relatorio, passe ou falhe.
        await info.attach(`${nome}-${tema}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
        await expect(page).toHaveScreenshot(`${nome}-${tema}.png`, { fullPage: true });
      });
    }
  });
}

test("login com senha errada mostra o erro", async ({ browser }) => {
  const contexto = await browser.newContext({ storageState: undefined });
  const page = await contexto.newPage();
  await redirecionarApi(page);
  await fixarTema(page, "claro");
  await page.goto("/login");
  await page.getByLabel("Usuário").fill("admin");
  await page.getByLabel("Senha").fill("senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveScreenshot("login-erro.png");
  await contexto.close();
});
