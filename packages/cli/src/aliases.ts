// Les alias de chemins du projet, lus depuis sa configuration TypeScript.
// Crypte ne lit jamais le `vite.config` d'un projet : voir la section 1.5.

import { join } from 'node:path'
import { parse } from 'tsconfck'
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

export async function aliasesOf(root: string): Promise<Alias[]> {
  for (const configName of CONFIG_NAMES) {
    // `parse` remonte depuis le dossier du chemin donné, qui n'a pas besoin
    // d'exister. `root` borne la remontée : sans elle, un projet sans
    // configuration hériterait de celle d'un dossier parent quelconque.
    const { tsconfigFile, tsconfig } = await parse(join(root, PROBE), { configName, root })
    if (!tsconfigFile) continue

    const { baseUrl = root, paths = {} } = tsconfig?.compilerOptions ?? {}
    return Object.entries(paths as Record<string, string[]>).flatMap(([pattern, targets]) => {
      // Seule la première cible est retenue : Vite résout un alias vers un
      // chemin, là où TypeScript essaie chaque candidat jusqu'à en trouver un.
      const target = targets[0]
      if (!target) return []

      return [
        {
          find: pattern.replace(WILDCARD, ''),
          replacement: join(baseUrl as string, target.replace(WILDCARD, '')),
        },
      ]
    })
  }

  return []
}
