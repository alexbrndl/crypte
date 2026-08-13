import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// La porte d'entrée réexporte-t-elle tout ? Un nom oublié disparaît de l'API
// publique sans que rien d'autre ne bronche. Voir docs/internal/architecture.md.

const here = dirname(fileURLToPath(import.meta.url))
const protocol = join(here, '..', '..', 'src', 'protocol')

// Lus dans le dossier : une liste écrite à la main serait un second oubli possible.
const MODULES = readdirSync(protocol)
  .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
  .map((file) => file.replace(/\.ts$/, ''))

const DECLARATION =
  /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:interface|type|function|const|class|enum|let|var)\s+(\w+)/gm

// Un symbole déclaré plus haut puis exporté seul. La garde `from` se pose contre
// l'accolade : après un `\s*`, le moteur n'en consomme aucun et la satisfait.
const LOCAL_EXPORT = /^export\s+(?:type\s+)?\{([^}]*)\}(?!\s*from)/gm

const REEXPORT_BLOCK = /export\s+(?:type\s+)?\{([^}]*)\}\s+from/g

// `Foo as Bar` expose `Bar`. Le `type` peut se poser sur l'entrée comme sur le bloc.
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

// Pris dans les accolades, pas dans le texte : une version antérieure trouvait
// les noms dans les commentaires et laissait passer leur retrait.
function reexported(): Set<string> {
  const source = readFileSync(join(protocol, 'index.ts'), 'utf8')
  return new Set(namesInBlocks(source, REEXPORT_BLOCK))
}

describe('porte d’entrée du protocole', () => {
  const exposed = reexported()

  // Sans ce cas, un dossier mal résolu ne laisserait rien à comparer.
  it('lit les modules du protocole', () => {
    expect(MODULES.length).toBeGreaterThan(0)
    expect(MODULES).toContain('manifest')
  })

  // Un `export *` exposerait des noms sans les nommer, hors de portée du contrôle.
  it('n’emploie pas de réexport global', () => {
    const source = readFileSync(join(protocol, 'index.ts'), 'utf8')
    expect(source).not.toMatch(/export\s+\*/)
  })

  it.each(MODULES)('réexporte tout ce que %s déclare', (module) => {
    const names = declaredIn(module)

    expect(names.length, `aucune déclaration lue dans ${module}.ts`).toBeGreaterThan(0)

    for (const name of names) {
      expect(exposed, `${name} n'est pas réexporté par index.ts`).toContain(name)
    }
  })

  // Contrôle négatif : sans lui, un ensemble qui contient tout passerait.
  it('ne tient pas un nom absent des réexports', () => {
    expect(exposed).not.toContain('PropDetailsZZZ')
  })
})
