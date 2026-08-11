import { readFileSync } from 'node:fs'
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

const MODULES = ['channel', 'id', 'manifest', 'story']
const DECLARATION = /^export (?:declare )?(?:interface|type|function|const|class|enum) (\w+)/gm
const REEXPORT_BLOCK = /export\s+(?:type\s+)?\{([^}]*)\}\s+from/g

function declaredIn(module: string): string[] {
  const source = readFileSync(join(protocol, `${module}.ts`), 'utf8')
  return [...source.matchAll(DECLARATION)].map((match) => match[1] as string)
}

// Les noms réellement réexportés, pris dans les accolades et non dans le texte du
// fichier. Une première version cherchait le nom n'importe où : elle le trouvait
// dans les commentaires de regroupement, et laissait donc passer le retrait d'un
// export cité juste au-dessus. Un test qui lit du texte doit lire la bonne partie.
function reexported(): Set<string> {
  const source = readFileSync(join(protocol, 'index.ts'), 'utf8')
  const names = [...source.matchAll(REEXPORT_BLOCK)].flatMap((match) =>
    (match[1] as string)
      .split(',')
      .map((entry) =>
        entry
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim(),
      )
      .filter((entry): entry is string => Boolean(entry)),
  )
  return new Set(names)
}

describe('porte d’entrée du protocole', () => {
  const exposed = reexported()

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
