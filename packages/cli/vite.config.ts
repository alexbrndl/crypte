import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: {
      // `index` est le binaire, `config` l'API que le projet importe. Deux
      // entrées, sinon importer `defineConfig` exécuterait la commande.
      index: 'src/index.ts',
      config: 'src/config.ts',
    },
    format: ['esm'],
    platform: 'node',
    dts: true,
  },
})
