import { defineConfig } from '@crypte/cli'
import react from '@vitejs/plugin-react'
import { createAdapter } from '@crypte/react'
import { Panel } from './src/components/Frame'

export default defineConfig({
  stories: 'stories',
  css: 'src/styles.css',
  adapter: createAdapter(),
  wrap: Panel,
  vite: { plugins: [react()] },
})
