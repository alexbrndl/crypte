import { defineConfig } from 'vite-plus'

export default defineConfig({
  run: {
    cache: true,
  },
  lint: {
    overrides: [
      {
        files: ['packages/core/src/**'],
        rules: {
          'no-restricted-imports': ['error', { patterns: ['react', 'react-dom', 'react/*'] }],
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
