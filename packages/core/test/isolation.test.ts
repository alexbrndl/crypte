import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// L'étanchéité des trois entrées, lue sur les bundles. Voir architecture.md.

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

// Réexport, effet de bord et import dynamique : n'en couvrir qu'un laisserait une
// porte de sortie hors de la fermeture.
const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g

// Le fichier d'une entrée, plus tout ce qu'il atteint par imports relatifs.
function closureOf(entry: string): string {
  const start = join(dist, `${entry}.js`)
  expect(existsSync(start), `${entry}.js absent : lance \`vp pack\` avant \`vp test\``).toBe(true)

  const seen = new Set<string>()
  const missing: string[] = []
  const queue = [start]
  let source = ''

  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)

    const content = readFileSync(file, 'utf8')
    source += content

    for (const match of content.matchAll(RELATIVE_IMPORT)) {
      const target = match[1]
      if (!target) continue

      const resolved = join(dirname(file), target)
      if (existsSync(resolved)) queue.push(resolved)
      else missing.push(target)
    }
  }

  // Une cible non résolue signifie que le suivi a cessé de fonctionner. L'ignorer
  // ramènerait la fermeture au fichier d'entrée, et toutes les assertions
  // passeraient sur lui seul.
  expect(missing, `${entry} : imports non résolus`).toEqual([])

  return source
}

describe('isolation des entrées de @crypte/core', () => {
  it('protocol ne contient rien de ui ni de preview', () => {
    const protocol = closureOf('protocol')
    expect(protocol).not.toContain('__crypte_ui__')
    expect(protocol).not.toContain('__crypte_preview__')
  })

  it('la fermeture de protocol reste close', () => {
    const protocol = closureOf('protocol')
    expect(protocol).not.toContain('createShellChannel')
    expect(protocol).not.toContain('createPreviewChannel')
  })

  // Contrôle négatif : il doit exercer le suivi des imports, sinon les assertions
  // ci-dessus passeraient sur le seul fichier d'entrée. `PROTOCOL_VERSION` vit
  // dans un chunk, donc l'y trouver prouve qu'un second fichier a été lu.
  it('la fermeture de protocol atteint ce qui n’est pas dans son fichier', () => {
    const entryOnly = readFileSync(join(dist, 'protocol.js'), 'utf8')
    expect(entryOnly).not.toContain('PROTOCOL_VERSION = ')
    expect(closureOf('protocol')).toContain('PROTOCOL_VERSION = ')
  })

  it('la fermeture de ui contient bien son propre marqueur', () => {
    expect(closureOf('ui')).toContain('__crypte_ui__')
  })

  // L'autre sens : les deux côtés du canal n'ont besoin que de `channel`. Importer
  // la barrière leur faisait embarquer `id.ts` et `manifest.ts` en code mort.
  it.each(['ui', 'preview'])('%s n’embarque que ce dont il se sert', (entry) => {
    const closure = closureOf(entry)
    expect(closure).toContain(`__crypte_${entry}__`)
    expect(closure).not.toContain('NFD')
  })
})
