// Ce qu'un projet écrit dans `crypte.config.ts`. Voir la section 1.5 de la spec.

import type { PluginOption } from 'vite'

export interface CrypteConfig {
  // Racine des fichiers de stories, relative à celle du projet.
  stories: string
  adapter: Adapter
  // Feuille de style chargée dans la preview, celle du projet.
  css?: string
  // Enveloppe appliquée à toutes les stories, avant celle du fichier. Opaque
  // comme l'adaptateur : `Wrap<unknown>` s'effondrerait en `unknown`, et le
  // champ aurait l'air typé sans rien contraindre.
  wrap?: GlobalWrap
  plugins?: CryptePlugin[]
  // Transformations que le projet impose, les auto-imports de Nuxt par exemple.
  // Crypte ne les devine jamais : il ne lit pas le `vite.config` du projet.
  vite?: { plugins?: PluginOption[] }
}

// Rend la configuration telle quelle, pour le typage et l'autocomplétion.
export function defineConfig(config: CrypteConfig): CrypteConfig {
  return config
}

// Opaques ici : le CLI les transporte sans jamais les interpréter. Leur forme
// appartient à l'adaptateur et aux plugins, que le lot 6 introduira.
export type Adapter = unknown
export type CryptePlugin = unknown
export type GlobalWrap = unknown
