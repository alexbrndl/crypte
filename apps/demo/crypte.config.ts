import { defineConfig } from '@crypte/cli'
import react from '@vitejs/plugin-react'
import compiler from 'babel-plugin-react-compiler'
import controls from '@crypte/controls'
import crypte from '@crypte/react'
import tokens from '@crypte/tokens'
import { Panel } from './src/components/Frame'
import hello from './plugins/hello'
import status from './plugins/status'

export default defineConfig({
  stories: 'stories',
  css: 'src/styles.css',
  adapter: crypte(),
  wrap: Panel,
  plugins: [tokens(), controls(), hello(), status()],
  // Le compilateur React est actif, comme sur le projet cible : c'est le risque
  // que `DCJ-170` demandait de lever ici, sur les cas navigateur plutôt que plus
  // tard sur un vrai projet.
  vite: { plugins: [react({ babel: { plugins: [compiler] } })] },
})
