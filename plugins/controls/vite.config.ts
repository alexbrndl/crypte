import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite-plus'
import type { TsdownPluginOption } from 'vite-plus/pack'

// Même montage que `@crypte/ui`, et pour les mêmes raisons : le plugin Vue
// transtypé pour le pack, et les déclarations produites par `vue-tsc`.
const sfc = vue({ isProduction: true }) as unknown as TsdownPluginOption

export default defineConfig({
  pack: {
    entry: {
      // La fabrique, lue par le CLI dans Node.
      index: 'src/index.ts',
      // Le panneau, servi tel quel au shell : `vue`, pair, reste son seul import
      // nu, que l'import map du shell résout.
      shell: 'src/shell.ts',
    },
    format: ['esm'],
    platform: 'neutral',
    plugins: [sfc],
    dts: false,
    exports: false,
  },
})
