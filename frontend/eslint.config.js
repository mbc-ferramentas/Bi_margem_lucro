// Fiscalizacao da arquitetura (FSD). O `tsc --noEmit` garante que os tipos
// fecham; o que ele nao sabe dizer e se uma pagina importou outra pagina ou se
// `compartilhado/` passou a depender de dominio. Essa regra e o unico mecanismo
// que impede a arquitetura de degradar em silencio.
//
// A direcao permitida e app -> paginas -> widgets -> entidades -> compartilhado.
// Cada camada importa so das de baixo, e nunca lateralmente: uma pagina nao
// conhece outra pagina, uma entidade nao conhece outra entidade. E o que mantem
// cada fatia removivel sem arrastar o resto.
//
// A sintaxe aqui e a do eslint-plugin-boundaries v7 (`boundaries/dependencies`
// com `policies`). A da v5 (`boundaries/element-types` com `rules`) ainda e
// aceita, mas nao reprova nada — so imprime avisos de depreciacao. Uma config
// inerte e pior do que nenhuma, porque parece proteger.

import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Cada camada e o que ela pode importar. */
const CAMADAS = {
  app: ["paginas", "widgets", "entidades", "compartilhado"],
  paginas: ["widgets", "entidades", "compartilhado"],
  widgets: ["entidades", "compartilhado"],
  entidades: ["compartilhado"],
  compartilhado: ["compartilhado"],
};

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
      // Sem o resolvedor, o plugin nao sabe que `@compartilhado/...` e um
      // arquivo do projeto: trata como pacote externo, nenhuma politica casa e
      // a regra fica muda. Foi assim que a primeira versao desta config passou
      // verde com violacoes deliberadas no codigo.
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: "./tsconfig.json" },
      },
      "boundaries/include": ["src/**/*"],
      "boundaries/elements": [
        // A ordem importa: o plugin casa o primeiro padrao que bate. `capture`
        // nomeia a fatia, e e o que permite proibir o import lateral entre duas
        // paginas ou duas entidades.
        { type: "app", pattern: "src/app/**" },
        { type: "paginas", pattern: "src/paginas/*", capture: ["fatia"] },
        { type: "widgets", pattern: "src/widgets/*", capture: ["fatia"] },
        { type: "entidades", pattern: "src/entidades/*", capture: ["fatia"] },
        { type: "compartilhado", pattern: "src/compartilhado/**" },
      ],
      "boundaries/files": [{ category: "teste", pattern: "**/*.test.{ts,tsx}" }],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            ...Object.entries(CAMADAS).map(([de, para]) => ({
              from: { element: { type: de } },
              allow: { to: { element: { types: { anyOf: para } } } },
            })),
            // Nao existe politica de paginas -> paginas, widgets -> widgets nem
            // entidades -> entidades: e assim que o import lateral fica proibido.
            // Dentro da propria fatia os caminhos sao relativos, e o plugin trata
            // isso como o mesmo elemento — nao passa por politica nenhuma.
            // Nenhum modulo de producao depende de um arquivo de teste.
            { disallow: { to: { file: { categories: "teste" } } } },
          ],
        },
      ],

      // Uma fatia se importa pelo seu `index.ts`, nunca por caminho interno —
      // senao o barrel nao e contrato nenhum. `compartilhado` e `app` ficam
      // livres de proposito: os atomos do shadcn e as moleculas sao importados
      // pelo caminho direto para nao arrastar o kit inteiro a cada tela.
      "boundaries/entry-point": [
        "error",
        {
          default: "disallow",
          policies: [
            { target: { element: { type: "paginas" } }, allow: "index.ts" },
            { target: { element: { type: "widgets" } }, allow: "index.ts" },
            { target: { element: { type: "entidades" } }, allow: "index.ts" },
            { target: { element: { type: "compartilhado" } }, allow: "**" },
            { target: { element: { type: "app" } }, allow: "**" },
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
    // Os testes atravessam fronteira de proposito: `paginas.test.tsx` monta as
    // 13 paginas para garantir que nenhuma estoura ao renderizar.
    files: ["src/**/*.test.{ts,tsx}", "src/app/setupTests.ts"],
    rules: {
      "boundaries/dependencies": "off",
      "boundaries/entry-point": "off",
    },
  },
);
