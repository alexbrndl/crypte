// Les alias de chemins du projet, lus depuis sa configuration TypeScript.
// Crypte ne lit jamais le `vite.config` d'un projet : voir la section 1.5.
// Les écarts entre TypeScript et Vite sont traités ici, voir architecture.md.

import { dirname, resolve } from 'node:path'
import { parse, type TSConfckParseResult } from 'tsconfck'
import type { Alias } from 'vite'
import { ConfigError } from './errors'

// Les deux noms admis, celui de TypeScript et celui des projets JavaScript.
// `jsconfig.json` n'est pas une commodité : c'est le seul endroit où un projet
// sans TypeScript peut déclarer ses alias.
const CONFIG_NAMES = ['tsconfig.json', 'jsconfig.json']

// Le joker en fin de motif, précédé d'une barre oblique : `@/*`. C'est la seule
// forme que Vite sait traiter en chaîne, son comparateur testant `id === find`
// ou `id.startsWith(find + '/')`.
const SLASHED_WILDCARD = /\/\*$/

// Nom fictif : `parse` attend un fichier et remonte depuis son dossier.
const PROBE = '__crypte__'

interface Paths {
  paths: Record<string, string[]>
  base: string
}

export async function aliasesOf(root: string): Promise<Alias[]> {
  for (const configName of CONFIG_NAMES) {
    // `parse` remonte depuis le dossier du chemin donné, qui n'a pas besoin
    // d'exister. `root` borne la remontée : sans elle, un projet sans
    // configuration hériterait de celle d'un dossier parent quelconque.
    let result: TSConfckParseResult
    try {
      result = await parse(resolve(root, PROBE), { configName, root })
    } catch (cause) {
      // Un fichier à moitié écrit, ou une virgule en trop : le dire plutôt que
      // de laisser remonter une trace de pile venue d'une bibliothèque.
      throw new ConfigError(`${configName} n'a pas pu être lu : ${(cause as Error).message}`)
    }

    if (!result.tsconfigFile) continue

    const found = pathsOf(result, root)
    // Un fichier trouvé mais sans `paths` ne clôt pas la recherche : sinon un
    // `tsconfig.json` minimal rendrait le `jsconfig.json` voisin inatteignable.
    if (!found) continue

    return aliasesFrom(found)
  }

  return []
}

// Où vivent les `paths`, et sur quel dossier ils se comptent.
function pathsOf(result: TSConfckParseResult, root: string): Paths | undefined {
  const own = compilerPaths(result.tsconfig)
  if (own) return { paths: own, base: baseOf(result, root) }

  // Un `tsconfig.json` de style « solution » ne déclare que des références, et
  // c'est la forme que `npm create vite` produit : les `paths` sont dans le
  // fichier référencé, pas dans celui qu'on vient de lire.
  for (const referenced of result.referenced ?? []) {
    const paths = compilerPaths(referenced.tsconfig)
    if (paths) return { paths, base: baseOf(referenced, root) }
  }

  return undefined
}

// `tsconfck` rend `baseUrl` en absolu, mais pas les `paths` : hérités par
// `extends`, ils restent relatifs au fichier qui les **déclare**, qui n'est ni
// forcément celui qu'on a lu, ni le dernier de la chaîne. Un projet qui étend
// `@tsconfig/node22` et déclare ses propres chemins les verrait sinon comptés
// depuis `node_modules`.
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

function aliasesFrom({ paths, base }: Paths): Alias[] {
  return (
    Object.entries(paths)
      // Vite retient le premier alias qui correspond, TypeScript le motif le
      // plus long. Sans ce tri, `@/*` masque `@/lib/*` déclaré après lui.
      //
      // Les motifs exacts passent devant tous les jokers, quelle que soit leur
      // longueur : ils deviennent des expressions ancrées, qui ne peuvent donc
      // masquer personne. Sans cela, `@lib/*` intercepte l'import `@lib`.
      .sort(([a], [b]) => {
        const exactness = Number(a.endsWith('*')) - Number(b.endsWith('*'))
        return exactness || b.length - a.length
      })
      .flatMap(([pattern, targets]) => {
        // Seule la première cible est retenue : Vite résout un alias vers un
        // chemin, là où TypeScript essaie chaque candidat jusqu'à en trouver un.
        const target = targets[0]
        if (!target) return []

        const entry = aliasFor(pattern, target, base)
        return entry ? [entry] : []
      })
  )
}

// Trois formes de motif, trois traductions. Le comparateur en chaîne de Vite ne
// sait faire qu'un préfixe suivi d'une barre oblique : tout le reste demande une
// expression, sans quoi l'alias existe mais ne correspond jamais.
function aliasFor(pattern: string, target: string, base: string): Alias | undefined {
  // Le fourre-tout de TypeScript, qui n'a pas d'équivalent ici. Traduit, il
  // donnerait un `find` vide, que Vite fait correspondre à **tout** identifiant :
  // le point d'entrée lui-même serait réécrit et plus rien ne se résoudrait.
  // TypeScript ne l'applique qu'aux imports non relatifs, notion que Vite n'a pas.
  if (pattern === '*') return undefined

  if (SLASHED_WILDCARD.test(pattern)) {
    return {
      find: pattern.replace(SLASHED_WILDCARD, ''),
      replacement: resolve(base, target.replace(SLASHED_WILDCARD, '')),
    }
  }

  // Tout autre joker est écarté, et c'est un choix : `@*`, `*.css` ou
  // `@app/*/lib` sont valides côté TypeScript, mais un alias Vite réécrit sans
  // repli là où TypeScript retombe sur la résolution Node quand la cible mappée
  // n'existe pas. Traduit, `@*` intercepterait `@vue/runtime-core` et le projet
  // ne résoudrait plus aucun paquet scopé. Voir docs/suivi.md.
  if (pattern.includes('*')) return undefined

  // Un motif sans joker désigne un module précis, pas un préfixe : l'ancrer
  // évite que `@lib/x` parte vers `@lib/index.ts/x`.
  return { find: new RegExp(`^${escapeForRegExp(pattern)}$`), replacement: resolve(base, target) }
}

const SPECIAL = /[.*+?^${}()|[\]\\]/g

function escapeForRegExp(value: string): string {
  return value.replace(SPECIAL, '\\$&')
}
