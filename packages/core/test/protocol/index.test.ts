import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// `index.ts` est la porte d'entrée publique du protocole. Un nom oublié en le
// réorganisant disparaît de l'API sans qu'aucune autre vérification ne bronche :
// les consommateurs internes importent depuis les fichiers, pas depuis la porte,
// donc ni le typage ni la construction ne voient l'absence. C'est arrivé en
// regroupant les réexports par thème, où `StoryEntry` s'est perdu.
//
// La lecture est textuelle faute d'alternative : un type n'existe pas à
// l'exécution, il n'y a donc rien à énumérer dans le module importé.

const here = dirname(fileURLToPath(import.meta.url))
const protocol = join(here, '..', '..', 'src', 'protocol')

// Lus dans le dossier plutôt qu'énumérés ici : une liste écrite à la main est un
// second endroit à tenir à jour, et un module qu'on oublierait dans les deux
// serait invisible, c'est-à-dire exactement la faute que ce test surveille.
const MODULES = readdirSync(protocol)
  .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
  .map((file) => file.replace(/\.ts$/, ''))

// Toutes les formes déclaratives, y compris celles qui n'existent pas encore dans
// le protocole : sans elles, le premier `export async function` ajouté échapperait
// au contrôle sans que rien ne le signale.
const DECLARATION =
  /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:interface|type|function|const|class|enum|let|var)\s+(\w+)/gm

// Un symbole déclaré plus haut puis exporté par un `export { X }` sans `from`.
// Le `type` optionnel compte : `export type { X }` est la forme la plus probable
// dans un fichier qui ne décrit que des types. Et la garde `from` se pose juste
// après l'accolade, sans espace consommé avant elle : placée après un `\s*`, elle
// ne filtre rien, puisque le moteur peut n'en consommer aucun et la satisfaire.
const LOCAL_EXPORT = /^export\s+(?:type\s+)?\{([^}]*)\}(?!\s*from)/gm

const REEXPORT_BLOCK = /export\s+(?:type\s+)?\{([^}]*)\}\s+from/g

// Le nom public d'une entrée de bloc : `Foo as Bar` en expose `Bar`, et le
// préfixe `type` peut se poser sur l'entrée autant que sur le bloc entier.
function publicName(entry: string): string | undefined {
  const cleaned = entry.trim().replace(/^type\s+/, '')
  if (!cleaned) return undefined

  const parts = cleaned.split(/\s+as\s+/)
  return (parts[1] ?? parts[0])?.trim()
}

function namesInBlocks(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].flatMap((match) =>
    (match[1] as string)
      .split(',')
      .map(publicName)
      .filter((name): name is string => Boolean(name)),
  )
}

function declaredIn(module: string): string[] {
  const source = readFileSync(join(protocol, `${module}.ts`), 'utf8')
  const declarations = [...source.matchAll(DECLARATION)].map((match) => match[1] as string)
  return [...declarations, ...namesInBlocks(source, LOCAL_EXPORT)]
}

// Les noms réellement réexportés, pris dans les accolades et non dans le texte du
// fichier. Une première version cherchait le nom n'importe où : elle le trouvait
// dans les commentaires de regroupement, et laissait donc passer le retrait d'un
// export cité juste au-dessus. Un test qui lit du texte doit lire la bonne partie.
function reexported(): Set<string> {
  const source = readFileSync(join(protocol, 'index.ts'), 'utf8')
  return new Set(namesInBlocks(source, REEXPORT_BLOCK))
}

describe('porte d’entrée du protocole', () => {
  const exposed = reexported()

  // Sans ce cas, un dossier mal résolu rendrait une liste vide et il n'y aurait
  // plus rien à comparer, sans qu'aucune assertion ne s'en plaigne.
  it('lit les modules du protocole', () => {
    expect(MODULES.length).toBeGreaterThan(0)
    expect(MODULES).toContain('manifest')
  })

  // `export * from` exposerait des noms sans les nommer, donc hors de portée de
  // la lecture ci-dessus : le contrôle passerait au vert en ayant cessé de voir
  // ce qu'il compare. Le refuser vaut mieux que le croire couvert.
  it('n’emploie pas de réexport global', () => {
    const source = readFileSync(join(protocol, 'index.ts'), 'utf8')
    expect(source).not.toMatch(/export\s+\*/)
  })

  it.each(MODULES)('réexporte tout ce que %s déclare', (module) => {
    const names = declaredIn(module)

    // Sans ce garde-fou, un chemin devenu faux ou une déclaration écrite
    // autrement rendrait une liste vide, et la boucle suivante passerait au vert
    // sans avoir rien comparé.
    expect(names.length, `aucune déclaration lue dans ${module}.ts`).toBeGreaterThan(0)

    for (const name of names) {
      expect(exposed, `${name} n'est pas réexporté par index.ts`).toContain(name)
    }
  })

  // Contrôle négatif : sans lui, les assertions ci-dessus passeraient à
  // l'identique si la lecture rendait un ensemble qui contient tout.
  it('ne tient pas un nom absent des réexports', () => {
    expect(exposed).not.toContain('PropDetailsInputZZZ')
  })
})
