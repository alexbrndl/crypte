import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite-plus'
import type { TsdownPluginOption } from 'vite-plus/pack'

// The pack bundles its own copy of Rolldown's types, so a Vite plugin does not
// type-check against it although its hooks run the same. Without the cast the
// compiler gives up on the comparison and `vp check` fails.
const sfc = vue({ isProduction: true }) as unknown as TsdownPluginOption

export default defineConfig({
  pack: {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm'],
    platform: 'neutral',
    plugins: [sfc],
    // Declarations come from `vue-tsc` in the `pack` script instead: the pack's
    // own generator runs TypeScript 7, which no longer has the API `vue-tsc`
    // needs, and fails on the first `.vue` file.
    dts: false,
    exports: false,
  },
})
