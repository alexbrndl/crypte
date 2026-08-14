import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Le catalogue de mutations se périme en silence : une refonte déplace la ligne
// citée, le contrôle ne trouve plus quoi casser, et la garantie devient muette.
// Trois fois sur ce lot, appris chaque fois par un contrôle de quatre minutes.
// Ces cas le disent en une seconde. Voir docs/internal/architecture.md.

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mutations = JSON.parse(readFileSync(join(root, 'test', 'mutations.json'), 'utf8'))

const sources = new Map()

function sourceOf(file) {
  if (!sources.has(file)) sources.set(file, readFileSync(join(root, file), 'utf8'))

  return sources.get(file)
}

describe('le catalogue de mutations', () => {
  // Sans ce cas, une liste vide passerait tous les autres.
  it('porte des garanties', () => {
    expect(mutations.length).toBeGreaterThan(50)
  })

  it('cite un motif présent une seule fois dans son fichier', () => {
    for (const { garantie, fichier, avant } of mutations) {
      expect(sourceOf(fichier).split(avant).length - 1, `${garantie} — dans ${fichier}`).toBe(1)
    }
  })

  // Une mutation qui ne change rien est gardée par n'importe quel test.
  it('change vraiment le code', () => {
    for (const { garantie, avant, apres } of mutations) {
      expect(avant, garantie).not.toBe(apres)
    }
  })

  it('nomme un test attendu et une origine', () => {
    for (const { garantie, attendu, trouvee } of mutations) {
      expect(attendu, garantie).toBeTruthy()
      expect(trouvee, garantie).toBeTruthy()
    }
  })
})
