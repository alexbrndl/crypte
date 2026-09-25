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
// redessine plus, sans avertissement. Mesuré dans Chromium. Rouvert quand un
// plugin importe `@crypte/ui` : il rejoint alors l'import map, pour la même raison.
//
// La version avec compilateur : un module écrit à la main avec `template` ne
// rendait rien sans elle, et sans un mot. 21 Ko gzip de plus, servis en local.
const browserVue = createRequire(import.meta.url).resolve('vue/dist/vue.esm-browser.prod.js')

const shared: Plugin = {
  name: 'crypte:shared-vue',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'vendor/vue.js', source: readFileSync(browserVue) })
  },
}

export default defineConfig({
  plugins: [vue(), shared],
  build: { rolldownOptions: { external: ['vue'] } },
})
