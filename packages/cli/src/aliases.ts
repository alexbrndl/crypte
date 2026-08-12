// Les alias de chemins du projet, lus depuis sa configuration TypeScript.
// Crypte ne lit jamais le `vite.config` d'un projet : voir la section 1.5.
// Les quatre écarts entre TypeScript et Vite sont traités ici, voir architecture.md.

import { dirname, resolve } from 'node:path'
import { parse, type TSConfckParseResult } from 'tsconfck'
import type { Alias } from 'vite'

// Les deux noms admis, celui de TypeScript et celui des projets JavaScript.
// `jsconfig.json` n'est pas une commodité : c'est le seul endroit où un projet
// sans TypeScript peut déclarer ses alias.
const CONFIG_NAMES = ['tsconfig.json', 'jsconfig.json']

// Le suffixe des motifs de `paths`, à retirer des deux côtés : Vite fait
// correspondre un préfixe, TypeScript un motif.
const WILDCARD = /\/\*$/

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
  const own = result.tsconfig?.compilerOptions?.paths as Record<string, string[]> | undefined
  if (own) return { paths: own, base: baseOf(result, root) }

  // Un `tsconfig.json` de style « solution » ne déclare que des références, et
  // c'est la forme que `npm create vite` produit : les `paths` sont dans le
  // fichier référencé, pas dans celui qu'on vient de lire.
  for (const referenced of result.referenced ?? []) {
    const paths = referenced.tsconfig?.compilerOptions?.paths as
      | Record<string, string[]>
      | undefined
    if (paths) return { paths, base: baseOf(referenced, root) }
  }

  return undefined
}

// `tsconfck` rend `baseUrl` en absolu, mais pas les `paths` : hérités par
// `extends` d'un autre dossier, ils restent relatifs au fichier qui les déclare.
// Sans `baseUrl`, c'est donc ce fichier qui sert de base, jamais celui qui hérite.
function baseOf(result: TSConfckParseResult, root: string): string {
  const baseUrl = result.tsconfig?.compilerOptions?.baseUrl as string | undefined
  if (baseUrl) return baseUrl

  const declaring = result.extended?.at(-1)?.tsconfigFile ?? result.tsconfigFile
  return declaring ? dirname(declaring) : root
}

function aliasesFrom({ paths, base }: Paths): Alias[] {
  return (
    Object.entries(paths)
      // Vite retient le premier alias qui correspond, TypeScript le motif le
      // plus long. Sans ce tri, `@/*` masque `@/lib/*` déclaré après lui.
      .sort(([a], [b]) => b.length - a.length)
      .flatMap(([pattern, targets]) => {
        // Seule la première cible est retenue : Vite résout un alias vers un
        // chemin, là où TypeScript essaie chaque candidat jusqu'à en trouver un.
        const target = targets[0]
        if (!target) return []

        return [
          {
            find: pattern.replace(WILDCARD, ''),
            replacement: resolve(base, target.replace(WILDCARD, '')),
          },
        ]
      })
  )
}
