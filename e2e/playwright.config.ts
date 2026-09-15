import { defineConfig, devices } from "@playwright/test";

// Roda SEMPRE dentro do container `bi-margem-lucro-e2e` (make e2e): a imagem
// oficial do Playwright fixa fontes e navegador, e e isso que torna o print
// comparavel entre maquinas. Baseline gerado no host nao casa com o container.
const WEB = process.env.E2E_WEB_URL ?? "http://bi-margem-lucro-web:5173";

export default defineConfig({
  testDir: "./testes",
  outputDir: "./resultados",
  snapshotPathTemplate: "{testDir}/__prints__/{testFilePath}/{arg}-{projectName}{ext}",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "relatorio", open: "never" }]],
  expect: {
    toHaveScreenshot: {
      // Antialiasing de fonte varia alguns pixels; mudanca de layout nao.
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: WEB,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    // Todo passo fica registrado: o print de evidencia vai para o relatorio
    // mesmo quando o teste passa.
    screenshot: "on",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /autenticacao\.setup\.ts/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: ".auth/admin.json" },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], storageState: ".auth/admin.json" },
      dependencies: ["setup"],
    },
  ],
});
