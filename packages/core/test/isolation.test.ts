import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const RELATIVE_IMPORT = /from\s*['"](\.[^'"]*)['"]/g

// Ce que produit le pack pour une entrée : son fichier, plus tout ce qu'il atteint
// par imports relatifs. Une entrée découpée en plusieurs fichiers sources réexporte
// depuis un chunk, ce qui est légitime ; ce qui ne l'est pas, c'est que ce chunk
// contienne le code d'une autre entrée.
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
  // Le test porte sur ce que l'entrée atteint réellement, pas sur la forme de ses
  // imports. Une version antérieure interdisait tout import relatif : elle est
  // devenue inopérante dès que protocol a été découpé en plusieurs fichiers.
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

  // Contrôle négatif : sans lui, une erreur de chemin ferait lire une chaîne vide,
  // et les assertions ci-dessus passeraient sur du néant.
  it('la fermeture de ui contient bien son propre marqueur', () => {
    expect(closureOf('ui')).toContain('__crypte_ui__')
  })
})
