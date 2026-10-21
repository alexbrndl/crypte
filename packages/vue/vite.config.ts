import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm'],
    platform: 'neutral',
    dts: true,
    exports: true,
  },
})
