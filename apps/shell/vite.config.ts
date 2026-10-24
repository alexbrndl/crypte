import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

// Une seule page. La preview est servie par le CLI et compilée dans le projet
// de l'utilisateur, par le Vite du CLI : elle importe son adaptateur et ses
// stories, donc elle ne peut pas être construite ici.

// Vue hors du bundle, résolu par l'import map de `index.html` vers ce fichier :
// le shell et les panneaux des plugins chargent ainsi la même copie. Avec une
// seconde copie, `inject` passe encore mais l'état propre d'un panneau ne
// redessine plus, sans avertissement. Mesuré dans Chromium.
//
// La version avec compilateur : un module écrit à la main avec `template` ne
// rendait rien sans elle, et sans un mot. 21 Ko gzip de plus, servis en local.
const require = createRequire(import.meta.url)
const browserVue = require.resolve('vue/dist/vue.esm-browser.prod.js')

// `@crypte/ui` de même, mais construit ici, comme une entrée du build plutôt que
// copié : les panneaux des plugins dessinent avec les composants du shell, une
// seule version de chacun, et le shell et `@crypte/ui` partagent la même copie de
// Reka. Copié, son `dist` en portait une seconde. Signature stricte : l'entrée
// garde les noms que les plugins importent. Ses styles restent dans la feuille du
// shell, que `main.ts` importe.
const ui = require.resolve('@crypte/ui')

const shared: Plugin = {
  name: 'crypte:shared',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'vendor/vue.js', source: readFileSync(browserVue) })
  },
}

export default defineConfig({
  // Relatif, comme l'import map de `index.html` : un build de `crypte build` peut
  // être servi sous un chemin.
  base: './',
  plugins: [vue(), shared],
  build: {
    rolldownOptions: {
      external: ['vue'],
      input: { index: 'index.html', 'vendor/ui': ui },
      preserveEntrySignatures: 'strict',
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'vendor/ui' ? 'vendor/ui.js' : 'assets/[name]-[hash].js',
      },
    },
  },
})
