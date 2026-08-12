// Où le projet déclare ses chemins, et depuis quel dossier ils se comptent.
// Ce qu'on en fait est dans `paths.ts`.

import { dirname, resolve } from 'node:path'
import { parse, type TSConfckParseResult } from 'tsconfck'
import { ConfigError } from './errors'
import type { ProjectPaths } from './paths'

// Les deux noms admis, celui de TypeScript et celui des projets JavaScript.
// `jsconfig.json` n'est pas une commodité : c'est le seul endroit où un projet
// sans TypeScript peut déclarer ses chemins.
const CONFIG_NAMES = ['tsconfig.json', 'jsconfig.json']

// Nom fictif : `parse` attend un fichier et remonte depuis son dossier.
const PROBE = '__crypte__'

export async function projectPathsOf(root: string): Promise<ProjectPaths | undefined> {
  for (const configName of CONFIG_NAMES) {
    // `root` borne la remontée : sans elle, un projet sans configuration
    // hériterait de celle d'un dossier parent quelconque.
    let result: TSConfckParseResult
    try {
      result = await parse(resolve(root, PROBE), { configName, root })
    } catch (cause) {
      // Un fichier à moitié écrit, ou une virgule en trop : le dire plutôt que
      // de laisser remonter une trace de pile venue d'une bibliothèque.
      throw new ConfigError(`${configName} n'a pas pu être lu : ${(cause as Error).message}`)
    }

    if (!result.tsconfigFile) continue

    const found = pathsIn(result, root)
    // Un fichier trouvé mais sans chemins ne clôt pas la recherche : sinon un
    // `tsconfig.json` minimal rendrait le `jsconfig.json` voisin inatteignable.
    if (found) return found
  }

  return undefined
}

function pathsIn(result: TSConfckParseResult, root: string): ProjectPaths | undefined {
  const own = compilerPaths(result.tsconfig)
  if (own) return { paths: own, base: baseOf(result, root) }

  // Un `tsconfig.json` de style « solution » ne déclare que des références, et
  // c'est la forme que `npm create vite` produit : les chemins sont dans le
  // fichier référencé, pas dans celui qu'on vient de lire.
  for (const referenced of result.referenced ?? []) {
    const paths = compilerPaths(referenced.tsconfig)
    if (paths) return { paths, base: baseOf(referenced, root) }
  }

  return undefined
}

// `tsconfck` rend `baseUrl` en absolu, mais pas les chemins : hérités par
// `extends`, ils restent relatifs au fichier qui les **déclare**. Un projet qui
// étend `@tsconfig/node22` et déclare les siens les verrait sinon comptés depuis
// `node_modules`.
function baseOf(result: TSConfckParseResult, root: string): string {
  const baseUrl = result.tsconfig?.compilerOptions?.baseUrl as string | undefined
  if (baseUrl) return baseUrl

  const declaring = declaringFile(result) ?? result.tsconfigFile
  return declaring ? dirname(declaring) : root
}

// Le premier fichier de la chaîne qui écrit `paths` lui-même. `extended` va du
// fichier d'origine au plus lointain, et chaque entrée porte ce que ce niveau
// déclare, sans héritage : seul `result.tsconfig` est fusionné.
function declaringFile(result: TSConfckParseResult): string | undefined {
  for (const level of result.extended ?? []) {
    if (compilerPaths(level.tsconfig)) return level.tsconfigFile
  }

  return undefined
}

// Un `paths` vide ne compte pas : sinon `"paths": {}` dans un `tsconfig.json`
// rend le `jsconfig.json` voisin inatteignable, ce que la poursuite évite.
function compilerPaths(config: unknown): Record<string, string[]> | undefined {
  const paths = (config as { compilerOptions?: { paths?: unknown } })?.compilerOptions?.paths
  if (!paths || typeof paths !== 'object' || Object.keys(paths).length === 0) return undefined

  return paths as Record<string, string[]>
}
