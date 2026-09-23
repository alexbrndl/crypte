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
    // Pas de `exports: true` ici, contrairement aux trois autres paquets : la
    // génération réécrit aussi `bin` en dérivant son nom de celui du paquet. La
    // commande installée s'appellerait `cli`, sans erreur de build.
  },
})
