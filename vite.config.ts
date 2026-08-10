import { defineConfig } from 'vite-plus'

export default defineConfig({
  run: {
    cache: true,
  },
  lint: {},
  fmt: {
    ignorePatterns: ['dist/**', 'docs/**', 'README.md'],
    singleQuote: true,
    semi: false,
  },
  test: {},
  staged: {
    '*.{ts,tsx,vue,js,mjs}': 'vp check --fix',
  },
})
