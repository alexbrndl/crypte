import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm'],
    platform: 'node',
    dts: true,
    exports: true,
  },
})
