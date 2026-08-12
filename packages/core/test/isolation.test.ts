import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// L'étanchéité des trois entrées, lue sur les bundles. Voir architecture.md.

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

// Réexport, effet de bord et import dynamique : n'en couvrir qu'un laisserait une
// porte de sortie hors de la fermeture.
const RELATIVE_IMPORT_SOURCE = /(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/
const RELATIVE_IMPORT = new RegExp(RELATIVE_IMPORT_SOURCE, 'g')

// Le fichier d'une entrée, plus tout ce qu'il atteint par imports relatifs.
function closureOf(entry: string, base = dist): string {
  const start = join(base, `${entry}.js`)
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
  // Hors de `dist`, qui est le contenu publié : un run interrompu avant le
  // nettoyage y laisserait deux modules, qui partiraient dans le paquet npm.
  let sandbox: string

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'crypte-isolation-'))
    writeFileSync(join(sandbox, 'probe-target.js'), 'export const PROBE = "__crypte_probe__"\n')
    writeFileSync(join(sandbox, 'probe-entry.js'), 'export { PROBE } from "./probe-target.js"\n')
  })

  afterAll(() => {
    // Sans la garde, un `beforeAll` en échec laisse `sandbox` indéfini et c'est
    // l'erreur du nettoyage qui s'affiche, pas la vraie.
    if (sandbox) rmSync(sandbox, { recursive: true, force: true })
  })

  it('atteint un fichier que l’entrée ne fait qu’importer', () => {
    const entryOnly = readFileSync(join(sandbox, 'probe-entry.js'), 'utf8')
    expect(entryOnly).not.toContain('__crypte_probe__')
    expect(closureOf('probe-entry', sandbox)).toContain('__crypte_probe__')
  })
})

describe('isolation des entrées de @crypte/core', () => {
  it('protocol ne contient rien de ui ni de preview', () => {
    const protocol = closureOf('protocol')

    // Les deux cas sur `protocol` n'ont que des assertions négatives, qui
    // passeraient sur une chaîne vide. Celle-ci vérifie qu'il y a de quoi lire.
    expect(protocol).toContain('normalizeSegment')

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
  // Sur la fermeture, comme les autres cas. Une version antérieure exigeait de
  // `ui` qu'il n'ait aucun import relatif : c'est le critère que la section 4
  // de architecture.md déclare invalide, et il aurait rougi le jour où `ui` lit
  // une valeur du canal, sans qu'aucune étanchéité soit rompue.
  //
  // Le cas est aujourd'hui vacant pour `ui`, qui n'importe que des types : il
  // mordra dès qu'il importera une valeur, comme `preview` le fait déjà.
  it.each(['ui', 'preview'])('%s n’embarque que ce dont il se sert', (entry) => {
    const closure = closureOf(entry)
    expect(closure).toContain(`__crypte_${entry}__`)

    for (const symbol of OUTSIDE_THE_CHANNEL) {
      expect(closure, `${entry} embarque ${symbol}`).not.toContain(symbol)
    }
  })
})
