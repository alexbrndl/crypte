// Les noms qu'un module du protocole exporte, lus dans son texte.
//
// Partagé par `protocol/index.test.ts` et `spec.test.ts`, qui posaient la même
// question à deux copies : elles avaient déjà divergé, et la plus stricte
// abandonnait en silence les entrées qu'elle ne reconnaissait pas.
// Voir docs/internal/architecture.md.

// Un type n'existe pas à l'exécution : il n'y a rien à énumérer dans le module
// importé, d'où la lecture du texte. Les formes couvrent celles que le protocole
// n'emploie pas encore, `export async function` par exemple.
export const DECLARATION =
  /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:interface|type|function|const|class|enum|let|var)\s+(\w+)/gm

// Un symbole déclaré plus haut puis exporté seul. La garde `from` se pose contre
// l'accolade : après un `\s*`, le moteur n'en consomme aucun et la satisfait.
export const LOCAL_EXPORT = /^export\s+(?:type\s+)?\{([^}]*)\}(?!\s*from)/gm

export const REEXPORT_BLOCK = /export\s+(?:type\s+)?\{([^}]*)\}\s+from/g

// `Foo as Bar` expose `Bar`. Le `type` peut se poser sur l'entrée comme sur le
// bloc. Une entrée vide ne nomme rien ; tout le reste rend un nom, plutôt que
// d'être abandonné sans un mot.
export function publicName(entry: string): string | undefined {
  const cleaned = entry.trim().replace(/^type\s+/, '')
  if (!cleaned) return undefined

  const parts = cleaned.split(/\s+as\s+/)

  return (parts[1] ?? parts[0])?.trim()
}

// Les noms cités dans les accolades des blocs que le motif trouve.
export function namesInBlocks(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].flatMap((match) =>
    (match[1] as string)
      .split(',')
      .map(publicName)
      .filter((name): name is string => Boolean(name)),
  )
}

// Tout ce qu'un module déclare puis exporte, sous toutes les formes ci-dessus.
export function declaredIn(source: string): string[] {
  return [
    ...[...source.matchAll(DECLARATION)].map((match) => match[1] as string),
    ...namesInBlocks(source, LOCAL_EXPORT),
  ]
}
