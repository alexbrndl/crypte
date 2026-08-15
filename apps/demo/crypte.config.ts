import { defineConfig } from '@crypte/cli'
import { createAdapter } from '@crypte/react'

export default defineConfig({
  stories: 'stories',
  css: 'src/styles.css',
  adapter: createAdapter(),
})
