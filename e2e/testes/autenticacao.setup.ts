import { expect, test as setup } from "@playwright/test";

import { redirecionarApi } from "./apoio";

const usuario = process.env.E2E_USUARIO ?? "admin";
const senha = process.env.E2E_SENHA ?? "mbcti123";

setup("login pela tela", async ({ page }) => {
  await redirecionarApi(page);
  await page.goto("/login");
  await page.getByLabel("Usuário").fill(usuario);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  await page.context().storageState({ path: ".auth/admin.json" });
});
