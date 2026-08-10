import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), react({ include: '**/*.tsx' })],
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        preview: 'preview.html',
      },
    },
  },
})
