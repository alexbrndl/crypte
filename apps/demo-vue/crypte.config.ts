import { defineConfig } from '@crypte/cli'
import vue from '@crypte/vue'
import vuePlugin from '@vitejs/plugin-vue'

// La démonstration Vue : le même shell que celle de React, un autre adaptateur.
// Le plugin Vite est au projet, comme `react()` l'est dans `apps/demo`. Pas de
// `wrap` ici : la configuration s'exécute dans Node, qui ne charge pas un `.vue`.
export default defineConfig({
  stories: 'stories',
  components: 'src/components',
  adapter: vue(),
  vite: { plugins: [vuePlugin()] },
})
