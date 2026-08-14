import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Le catalogue de mutations se périme en silence : une refonte déplace ce qu'il
// cite, le contrôle ne trouve plus quoi casser ou ne sait plus quoi attendre, et
// la garantie devient muette. Cinq fois sur le lot 4, appris chaque fois par un
// contrôle de quatre minutes. Ces cas le disent en une seconde.
// Voir docs/internal/architecture.md.

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mutations = JSON.parse(readFileSync(join(root, 'test', 'mutations.json'), 'utf8'))

const sources = new Map()

function sourceOf(file) {
  if (!sources.has(file)) sources.set(file, readFileSync(join(root, file), 'utf8'))

  return sources.get(file)
}

// `readdirSync` récursif plutôt que `globSync`, stable seulement à partir de
// Node 24 alors que l'intégration continue passe aussi par Node 22.
const testFiles = readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.test\.(ts|mjs)$/.test(entry.name))
  .map((entry) => relative(root, join(entry.parentPath, entry.name)))
  .filter((path) => !path.startsWith('node_modules/'))

// `attendu` est du texte libre : le contrôle le cherche comme sous-chaîne dans la
// sortie, donc une vingtaine d'entrées nomment un titre de cas, un code d'erreur
// TypeScript ou une fixture. Seules celles qui commencent par un nom de fichier
// de test se vérifient d'ici.
const NAMES_A_FILE = /^[\w.-]+\.test\.(ts|mjs) > /

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

  // Le troisième mode de péremption, après le motif disparu et le motif ambigu :
  // renommer un test, ou son fichier, laisse une garantie qui n'attend plus rien.
  // C'est exactement ce que DCJ-210 s'apprête à faire sur 183 noms de tests.
  it('attend un cas qui existe vraiment', () => {
    const named = mutations.filter(({ attendu }) => NAMES_A_FILE.test(attendu))

    // Sans ce compte, une expression qui ne correspond plus à rien viderait la
    // boucle et le cas passerait sans rien vérifier.
    expect(named.length, 'aucune garantie ne nomme son fichier de test').toBeGreaterThan(50)

    for (const { garantie, attendu } of named) {
      const segments = attendu.split(' > ')
      const file = segments[0]
      const title = segments.at(-1)

      // Le nom de base peut désigner plusieurs fichiers, `ui.test.ts` en vise
      // cinq, et le contrôle ne cherche qu'une sous-chaîne dans la sortie : il
      // suffit donc que l'un d'eux porte le cas.
      const found = testFiles.filter((path) => path.endsWith(`/${file}`) || path === file)

      expect(found.length, `${garantie} — aucun fichier « ${file} »`).toBeGreaterThan(0)
      expect(
        found.some((path) => sourceOf(path).includes(title)),
        `${garantie} — cas « ${title} » dans aucun de ${found.join(', ')}`,
      ).toBe(true)
    }
  })
})
