// Ce que le CLI sait d'un projet : sa configuration, ses alias, et la
// configuration Vite qui en découle.

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadConfigFromFile, type InlineConfig } from 'vite'
import { projectPathsOf } from './config-paths'
import type { CrypteConfig } from './config'
import { pathsPlugin, type ProjectPaths } from './paths'
import { ConfigError } from './errors'

const CONFIG_FILE = 'crypte.config.ts'

export { ConfigError }

export interface Project {
  root: string
  config: CrypteConfig
  // Lus au chargement, pour ne pas relire les mêmes fichiers deux fois.
  paths: ProjectPaths | undefined
  // Les fichiers dont la configuration dépend, pour la relire quand ils
  // changent : `crypte.config.ts` et ce dont il dépend, plus la configuration
  // TypeScript d'où viennent les chemins.
  watch: string[]
}

export async function loadProject(input: string): Promise<Project> {
  // Normalisé une fois ici : un `crypte dev ./demo` passerait sinon un chemin
  // relatif à tout ce qui suit, et les chemins produits le resteraient.
  const root = resolve(input)
  const file = join(root, CONFIG_FILE)
  if (!existsSync(file)) {
    throw new ConfigError(`Aucun ${CONFIG_FILE} à la racine du projet (${root}).`)
  }

  // Le chargeur de Vite, plutôt qu'une brique de plus : il transpile le fichier
  // et rend les dépendances à surveiller. Il lève sur un module sans export par
  // défaut, avec un message qui parle de configuration Vite : le rattraper est
  // la seule façon de nommer le vrai fichier en cause.
  let loaded: Awaited<ReturnType<typeof loadConfigFromFile>>
  try {
    loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'development' },
      file,
      root,
      'silent',
    )
  } catch (cause) {
    throw new ConfigError(`${CONFIG_FILE} n'a pas pu être chargé : ${(cause as Error).message}`)
  }

  // Jamais nul ici : Vite ne rend `null` que lorsqu'il doit chercher le fichier
  // lui-même, et on lui en donne toujours un.
  const config = loaded?.config as unknown as CrypteConfig
  assertUsable(config)

  const paths = await projectPathsOf(root)
  const watch = [
    ...(loaded?.dependencies ?? []).map((dep) => resolve(root, dep)),
    ...(paths?.files ?? []),
  ]

  return { root, config, paths, watch }
}

// Deux champs seulement sont obligatoires, et l'erreur les nomme : la
// section 1.5 en fait le minimum de configuration du produit.
function assertUsable(config: CrypteConfig): void {
  if (typeof config?.stories !== 'string' || config.stories === '') {
    throw new ConfigError(
      `${CONFIG_FILE} doit déclarer \`stories\`, la racine des fichiers de stories.`,
    )
  }

  if (config.adapter == null) {
    throw new ConfigError(`${CONFIG_FILE} doit déclarer \`adapter\`, celui de son framework.`)
  }
}

// La configuration Vite du projet, montée depuis la sienne. Rien n'en est
// deviné : les alias viennent de sa configuration TypeScript, les plugins de ce
// qu'il déclare, et son `vite.config` n'est jamais lu.
export function viteConfigOf(project: Project): InlineConfig {
  const { root, config, paths } = project

  return {
    root,
    configFile: false,
    // Le résolveur passe après les résolveurs internes de Vite, donc un chemin
    // qui remplacerait un paquet installé reste sans effet. C'est ce même ordre
    // qui empêche un motif fourre-tout de détourner les imports relatifs.
    plugins: [...(paths ? [pathsPlugin(paths)] : []), ...(config.vite?.plugins ?? [])],
  }
}

// L'entrée CSS déclarée, en chemin absolu, ou rien si le projet n'en a pas.
export function cssEntryOf(project: Project): string | undefined {
  const { css } = project.config
  if (!css) return undefined

  return resolve(project.root, css)
}
