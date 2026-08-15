import { defineConfig } from '@crypte/cli'
import react from '@vitejs/plugin-react'
import { createAdapter } from '@crypte/react'

export default defineConfig({
  stories: 'stories',
  css: 'src/styles.css',
  adapter: createAdapter(),
  vite: { plugins: [react()] },
})
