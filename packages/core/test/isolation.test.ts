import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

// Ce que le canal n'a aucune raison d'atteindre. Plusieurs symboles plutôt qu'un
// seul : la disparition simultanée de tous rendrait le contrôle muet, celle d'un
// seul le rendrait complaisant.
const OUTSIDE_THE_CHANNEL = ['NFD', 'NFC', 'MANIFEST_VERSION']

// Contrôle négatif du suivi lui-même, sur deux fichiers écrits ici. L'ancrer sur
// la répartition en chunks le faisait rougir au premier refactoring légitime, et
// se taire quand la répartition rendait l'entrée autosuffisante.
describe('le suivi des imports', () => {
  const target = join(dist, 'probe-target.js')
  const entry = join(dist, 'probe-entry.js')

  beforeAll(() => {
    writeFileSync(target, 'export const PROBE = "__crypte_probe__"\n')
    writeFileSync(entry, 'export { PROBE } from "./probe-target.js"\n')
  })

  afterAll(() => {
    rmSync(entry, { force: true })
    rmSync(target, { force: true })
  })

  it('atteint un fichier que l’entrée ne fait qu’importer', () => {
    expect(readFileSync(entry, 'utf8')).not.toContain('__crypte_probe__')
    expect(closureOf('probe-entry')).toContain('__crypte_probe__')
  })
})

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

  it('la fermeture de ui contient bien son propre marqueur', () => {
    expect(closureOf('ui')).toContain('__crypte_ui__')
  })

  // L'autre sens : les deux côtés du canal n'ont besoin que de `channel`. Importer
  // la barrière leur faisait embarquer `id.ts` et `manifest.ts` en code mort.
  it.each(['ui', 'preview'])('%s n’embarque que ce dont il se sert', (entry) => {
    const closure = closureOf(entry)
    expect(closure).toContain(`__crypte_${entry}__`)

    for (const symbol of OUTSIDE_THE_CHANNEL) {
      expect(closure, `${entry} embarque ${symbol}`).not.toContain(symbol)
    }
  })
})
