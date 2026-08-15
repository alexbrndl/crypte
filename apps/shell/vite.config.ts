import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Une seule page. La preview est servie par le CLI et compilée par le Vite du
// projet de l'utilisateur : elle importe son adaptateur et ses stories, donc
// elle ne peut pas être construite ici. Voir docs/decisions.md.
export default defineConfig({
  plugins: [vue()],
})
