import { defineConfig } from '@crypte/cli'
import react from '@vitejs/plugin-react'
import compiler from 'babel-plugin-react-compiler'
import crypte from '@crypte/react'
import { Panel } from './src/components/Frame'

export default defineConfig({
  stories: 'stories',
  css: 'src/styles.css',
  adapter: crypte(),
  wrap: Panel,
  // Le compilateur React est actif, comme sur le projet cible : c'est le risque
  // que `DCJ-170` demandait de lever ici, sur les cas navigateur plutôt que plus
  // tard sur un vrai projet.
  vite: { plugins: [react({ babel: { plugins: [compiler] } })] },
})
