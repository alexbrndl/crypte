import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite-plus'
import type { TsdownPluginOption } from 'vite-plus/pack'

// Même montage que `@crypte/a11y` : une fabrique, un panneau et des hooks.
const sfc = vue({ isProduction: true }) as unknown as TsdownPluginOption

export default defineConfig({
  pack: {
    entry: {
      // La fabrique, lue par le CLI dans Node.
      index: 'src/index.ts',
      // Le panneau, servi tel quel au shell : `vue` et `@crypte/ui`, pairs, restent
      // ses seuls imports nus, que l'import map du shell résout.
      shell: 'src/shell.ts',
      // Les hooks, importés par le Vite du projet.
      preview: 'src/preview.ts',
    },
    format: ['esm'],
    platform: 'neutral',
    plugins: [sfc],
    dts: false,
    exports: false,
  },
})
