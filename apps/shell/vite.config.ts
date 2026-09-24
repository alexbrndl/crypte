import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Une seule page. La preview est servie par le CLI et compilée dans le projet
// de l'utilisateur, par le Vite du CLI : elle importe son adaptateur et ses
// stories, donc elle ne peut pas être construite ici.
export default defineConfig({
  plugins: [vue()],
})
