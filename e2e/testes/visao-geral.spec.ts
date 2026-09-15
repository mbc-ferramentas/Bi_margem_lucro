import { expect, type Page, test, type TestInfo } from "@playwright/test";

import { aguardarTela, fixarTema, redirecionarApi } from "./apoio";

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

// Os dois defeitos que o print estatico de telas.spec.ts nao pega: texto
// cortado dentro do cartao (so aparece medindo) e grafico que some ao passar o
// mouse (so aparece com o mouse em cima).

async function abrir(page: Page) {
  await redirecionarApi(page);
  await fixarTema(page, "claro");
  await page.goto("/");
  await expect(page).not.toHaveURL(/\/login/);
  await aguardarTela(page);
}

/** Textos de cartao que escapam da area util do proprio cartao. */
async function textosCortados(page: Page) {
  return page.evaluate(() => {
    const cortados: string[] = [];
    const cartoes = document.querySelectorAll<HTMLElement>(
      '[data-slot="card"], button:has(> [data-slot="card-content"])',
    );
    for (const cartao of cartoes) {
      const caixa = cartao.getBoundingClientRect();
      const alvos = cartao.querySelectorAll<HTMLElement>(
        '[data-slot="card-title"], [data-slot="card-content"] > span, [data-slot="card-content"] strong',
      );
      for (const el of alvos) {
        if (!el.textContent?.trim() || el.getAttribute("aria-hidden")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        // Meio pixel de tolerancia para arredondamento subpixel.
        // O texto precisa respeitar o respiro do cartao (a faixa de tom tem 3px
        // e o padding e 16px): colado na borda ja e corte visivel.
        if (r.left < caixa.left + 8 || r.right > caixa.right + 0.5) {
          cortados.push(`${el.textContent.trim().slice(0, 40)} (${r.left.toFixed(1)} < ${caixa.left.toFixed(1)})`);
        }
      }
    }
    return cortados;
  });
}

for (const largura of [1280, 1536, 1920]) {
  test(`cartoes sem texto cortado em ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 1000 });
    await abrir(page);
    expect(await textosCortados(page)).toEqual([]);
  });
}

test("cartoes sem texto cortado no celular", async ({ page }) => {
  await abrir(page);
  expect(await textosCortados(page)).toEqual([]);
});

// Todas as telas com grafico: o defeito do hover (cor de destaque invalida)
// e do ECharts, nao da visao geral.
const telasComGrafico = ["/", "/armazens", "/vendedores", "/skus", "/canais", "/carteira"];

for (const rota of telasComGrafico) {
  test(`grafico continua desenhado com o mouse em cima em ${rota}`, async ({ page }, info) => {
    await redirecionarApi(page);
    await fixarTema(page, "claro");
    await page.goto(rota);
    await expect(page).not.toHaveURL(/\/login/);
    await aguardarTela(page);
    await conferirHover(page, info);
  });
}

async function conferirHover(page: Page, info: TestInfo) {
  const graficos = page.locator('[role="img"]:has(svg)');
  const total = await graficos.count();
  info.annotations.push({ type: "graficos", description: String(total) });

  for (let i = 0; i < total; i++) {
    const grafico = graficos.nth(i);
    await grafico.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    // Tinta valida: quando a cor de destaque sai invalida o ECharts mantem o
    // <path> no DOM e o navegador ainda calcula um `fill` padrao, entao nem
    // contar nos nem ler o estilo computado pega o defeito. O que denuncia e o
    // proprio atributo de cor, que deixa de ser uma cor CSS.
    //
    // Preenchimento e traco contados em separado: a barra em destaque perde o
    // `fill` e ganha um traco, e somados os dois o total nao mudava.
    const pintados = () =>
      grafico.evaluate((el) => {
        const valida = (v: string | null) =>
          v !== null &&
          v !== "none" &&
          v !== "transparent" &&
          (v.startsWith("url(") || CSS.supports("color", v));
        const marcas = [...el.querySelectorAll("svg path, svg rect")];
        return `${marcas.filter((m) => valida(m.getAttribute("fill"))).length} preenchidas, ${
          marcas.filter((m) => valida(m.getAttribute("stroke"))).length
        } tracadas`;
      });
    const antes = await pintados();

    const caixa = await grafico.boundingBox();
    if (!caixa) continue;
    const nome = await grafico.getAttribute("aria-label");
    // Pontos soltos no grafico passam ao lado das barras e nunca acionam o
    // destaque: o mouse vai tambem ao centro de cada marca desenhada.
    const alvos = await grafico.evaluate((el) =>
      [...el.querySelectorAll("svg path, svg rect")]
        .map((m) => m.getBoundingClientRect())
        .filter((r) => r.width > 2 && r.height > 2 && r.width < el.clientWidth * 0.9)
        .slice(0, 12)
        .map((r) => [r.x + r.width / 2, r.y + r.height / 2] as const),
    );
    const pontos = [
      ...[[0.25, 0.3], [0.5, 0.6], [0.75, 0.8]].map(
        ([fx, fy]) => [caixa.x + caixa.width * fx, caixa.y + caixa.height * fy] as const,
      ),
      ...alvos,
    ];
    for (const [n, [x, y]] of pontos.entries()) {
      await page.mouse.move(x, y, { steps: 4 });
      await page.waitForTimeout(200);
      if (n < 3) await grafico.screenshot({ path: info.outputPath(`grafico-${i}-hover-${n}.png`) });
      const agora = await pintados();
      const [fAntes, tAntes] = antes.match(/\d+/g)!.map(Number);
      const [fAgora, tAgora] = agora.match(/\d+/g)!.map(Number);
      expect
        .soft(fAgora >= fAntes && tAgora >= tAntes, `${nome} @ (${x.toFixed(0)}, ${y.toFixed(0)}): ${antes} -> ${agora}`)
        .toBe(true);
    }
  }
}
