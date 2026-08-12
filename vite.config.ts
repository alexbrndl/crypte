import { defineConfig } from 'vite-plus'

export default defineConfig({
  run: {
    cache: true,
  },
  lint: {
    // La fixture du lot 3 imite un projet utilisateur : son `jsconfig.json`
    // porte un commentaire et un `baseUrl`, que TypeScript 7 refuse. C'est
    // précisément ce qu'un projet réel contient, et ce que le CLI doit savoir
    // lire. La vérifier comme du code du dépôt n'aurait aucun sens.
    ignorePatterns: ['packages/cli/test/fixture/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        files: ['packages/core/src/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            { patterns: ['react', 'react/*', 'react-dom', 'react-dom/*'] },
          ],
        },
      },
    ],
  },
  fmt: {
    ignorePatterns: ['dist/**', 'docs/**', 'README.md'],
    singleQuote: true,
    semi: false,
  },
  test: {},
  staged: {
    // Toutes les extensions que le formateur traite réellement : un .md hors du motif
    // est passé en commit sans être vérifié, ce qui est la raison d'être de ce bloc.
    '*.{ts,tsx,js,mjs,cjs,vue,json,md,yml,yaml}': 'vp check --fix',
  },
})
