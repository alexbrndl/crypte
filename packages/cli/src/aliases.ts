// Les alias de chemins du projet, lus depuis sa configuration TypeScript.
// Crypte ne lit jamais le `vite.config` d'un projet : voir la section 1.5.
// Les écarts entre TypeScript et Vite sont traités ici, voir architecture.md.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parse, toJson, type TSConfckParseResult } from 'tsconfck'
import type { Alias } from 'vite'

// Les deux noms admis, celui de TypeScript et celui des projets JavaScript.
// `jsconfig.json` n'est pas une commodité : c'est le seul endroit où un projet
// sans TypeScript peut déclarer ses alias.
const CONFIG_NAMES = ['tsconfig.json', 'jsconfig.json']

// Le suffixe joker d'un motif, la barre oblique comprise quand elle est là :
// `@/*` donne `@`, et `@*` donne `@`.
const WILDCARD = /\/?\*$/

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
    const result = await parse(resolve(root, PROBE), { configName, root })
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
// fichier d'origine au plus lointain, et la fusion donne la priorité au premier.
function declaringFile(result: TSConfckParseResult): string | undefined {
  for (const { tsconfigFile } of result.extended ?? []) {
    if (compilerPaths(rawConfig(tsconfigFile))) return tsconfigFile
  }

  return undefined
}

// Le contenu déclaré d'un fichier, avant fusion : `extended` porte les
// résultats fusionnés, où chaque niveau a déjà hérité des `paths` du suivant.
function rawConfig(file: string): unknown {
  try {
    return JSON.parse(toJson(readFileSync(file, 'utf8')))
  } catch {
    return undefined
  }
}

function compilerPaths(config: unknown): Record<string, string[]> | undefined {
  const paths = (config as { compilerOptions?: { paths?: unknown } })?.compilerOptions?.paths
  return paths && typeof paths === 'object' ? (paths as Record<string, string[]>) : undefined
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

        // Un motif sans joker désigne un module précis, pas un préfixe : le
        // rendre exact évite que `@lib/x` parte vers `@lib/index.ts/x`.
        const find = pattern.endsWith('*')
          ? pattern.replace(WILDCARD, '')
          : new RegExp(`^${escapeForRegExp(pattern)}$`)

        return [{ find, replacement: resolve(base, target.replace(WILDCARD, '')) }]
      })
  )
}

const SPECIAL = /[.*+?^${}()|[\]\\]/g

function escapeForRegExp(value: string): string {
  return value.replace(SPECIAL, '\\$&')
}
