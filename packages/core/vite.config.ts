import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: {
      protocol: 'src/protocol/index.ts',
      shell: 'src/shell/index.ts',
      preview: 'src/preview/index.ts',
    },
    format: ['esm'],
    platform: 'neutral',
    dts: true,
    exports: true,
  },
})
