import { defineConfig } from '@crypte/cli'

export default defineConfig({
  stories: 'stories',
  css: 'src/styles/app.css',
  adapter: { name: 'fixture' },
})
