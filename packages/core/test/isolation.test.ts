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
  const queue = [start]
  let source = ''

  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)

    // Le motif reconnaît aussi un chemin dans une chaîne du bundle, qui ne
    // désigne aucun fichier. Seule l'absence de l'entrée doit faire échouer.
    if (!existsSync(file)) continue

    const content = readFileSync(file, 'utf8')
    source += content

    for (const match of content.matchAll(RELATIVE_IMPORT)) {
      const target = match[1]
      if (target) queue.push(join(dirname(file), target))
    }
  }

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

  // Contrôle négatif. Il porte sur `protocol`, seule entrée dont le fichier est un
  // talon, et cherche une chaîne du corps d'une fonction : le talon cite les noms
  // qu'il réexporte, donc les chercher reviendrait à s'en contenter.
  it('la fermeture de protocol contient bien le code de ses fonctions', () => {
    expect(closureOf('protocol')).toContain('NFD')
  })

  it('la fermeture de ui contient bien son propre marqueur', () => {
    expect(closureOf('ui')).toContain('__crypte_ui__')
  })
})
