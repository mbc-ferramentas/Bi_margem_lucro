// Fiscalizacao da arquitetura (FSD). O `tsc --noEmit` garante que os tipos
// fecham; o que ele nao sabe dizer e se uma pagina importou outra pagina ou se
// `compartilhado/` passou a depender de dominio. Essa regra e o unico mecanismo
// que impede a arquitetura de degradar em silencio.
//
// A camada `legado` e temporaria: e tudo o que ainda nao foi movido para uma
// camada FSD. Ela pode ser importada por qualquer uma e importar qualquer uma,
// para que a migracao aconteca em fatias sem deixar o lint vermelho. Quando
// `legado` ficar vazia, a lista de `allow` abaixo passa a valer de verdade.

import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "eslint.config.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { boundaries, "react-hooks": reactHooks },
    settings: {
      "boundaries/include": ["src/**/*"],
      "boundaries/elements": [
        // A ordem importa: o plugin casa o primeiro padrao que bate.
        { type: "app", pattern: "src/app/**" },
        { type: "paginas", pattern: "src/paginas/*", capture: ["fatia"] },
        { type: "widgets", pattern: "src/widgets/*", capture: ["fatia"] },
        { type: "entidades", pattern: "src/entidades/*", capture: ["fatia"] },
        { type: "compartilhado", pattern: "src/compartilhado/**" },
        // Nao movido ainda.
        { type: "legado", pattern: "src/componentes/**" },
        { type: "legado", pattern: "src/api/**" },
        { type: "legado", pattern: "src/lib/**" },
        { type: "legado", pattern: "src/hooks/**" },
        { type: "legado", pattern: "src/*.{ts,tsx}" },
      ],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      "boundaries/element-types": [
        "warn",
        {
          default: "disallow",
          rules: [
            { from: "app", allow: ["paginas", "widgets", "entidades", "compartilhado", "legado"] },
            { from: "paginas", allow: ["widgets", "entidades", "compartilhado", "legado"] },
            { from: "widgets", allow: ["entidades", "compartilhado", "legado"] },
            { from: "entidades", allow: ["compartilhado", "legado"] },
            { from: "compartilhado", allow: ["compartilhado", "legado"] },
            { from: "legado", allow: ["app", "paginas", "widgets", "entidades", "compartilhado", "legado"] },
          ],
        },
      ],

      // Import lateral: uma pagina nao conhece outra pagina, uma entidade nao
      // conhece outra entidade. E o que mantem cada fatia removivel.
      "boundaries/no-private": ["warn", { allowUncles: false }],

      // Uma fatia se importa pelo seu `index.ts`, nunca por caminho interno —
      // senao o barrel nao e contrato nenhum.
      "boundaries/entry-point": [
        "warn",
        {
          default: "disallow",
          rules: [
            { target: ["paginas", "widgets", "entidades"], allow: "index.ts" },
            { target: ["app", "compartilhado", "legado"], allow: "**" },
          ],
        },
      ],

      // Regra nova do plugin do React, que reprova `setState` dentro de efeito.
      // Reprova 3 pontos que ja existiam antes desta arquitetura e que sao
      // deliberados (sincronizar URL -> estado, e o breakpoint do sidebar).
      // Fica como aviso: e informacao util, mas nao e divida desta migracao.
      "react-hooks/set-state-in-effect": "warn",

      // Ruido que atrapalha mais do que ajuda neste projeto.
      "@typescript-eslint/no-unused-vars": "off", // o tsc ja reprova com noUnusedLocals
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Testes atravessam fronteira de proposito: `paginas.test.tsx` monta as 13
    // paginas, e cada teste colocado importa o vizinho por caminho relativo.
    files: ["src/**/*.test.{ts,tsx}", "src/setupTests.ts"],
    rules: {
      "boundaries/element-types": "off",
      "boundaries/entry-point": "off",
      "boundaries/no-private": "off",
    },
  },
);
