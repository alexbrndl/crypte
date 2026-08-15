import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NAMES_A_FILE, concludes, targetOf } from './mutation-check.mjs'

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

// Élagué en descendant, pas filtré après. Un parcours complet du dépôt entrait
// dans `node_modules` et dans les copies de projet qu'écrivent les cas de
// rechargement : une de ces copies effacée pendant la descente faisait échouer
// l'import du fichier entier, donc ces cas-ci, par intermittence. Mesuré.
//
// `readdirSync` récursif plutôt que `globSync`, stable seulement à partir de
// Node 24 alors que l'intégration continue passe aussi par Node 22.
const PRUNED = /^(node_modules|dist|\.git|tmp-hot-.*|tmp-demo-.*|\.crypte)$/

function testFilesIn(folder) {
  const found = []

  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!PRUNED.test(entry.name)) found.push(...testFilesIn(join(folder, entry.name)))
      continue
    }

    if (entry.isFile() && /\.test\.(ts|tsx|mjs)$/.test(entry.name)) {
      found.push(relative(root, join(folder, entry.name)))
    }
  }

  return found
}

const testFiles = testFilesIn(root)

// Le motif vient du script qui s'en sert pour cibler : deux écritures rendraient
// cette validation muette sur la cible réellement lancée.
//
// `attendu` est du texte libre par construction, le contrôle le cherchant comme
// sous-chaîne dans la sortie : une vingtaine d'entrées nomment un titre de cas, un
// code d'erreur TypeScript ou une fixture, et seules celles qui portent `dans` ou
// qui commencent par un nom de fichier se vérifient d'ici.

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

  // La voie rapide est la seule décision du dépôt capable de rendre « vu » sans
  // preuve venue du gardien nommé. Une sonde l'a mesurée une fois ; ces cas la
  // gardent, sinon réduire `concludes` à `!quick.ok` passerait sans un mot.
  describe('la voie rapide du contrôle', () => {
    const attendu = 'stories.test.ts > la lecture des stories > un cas'

    it('conclut quand le fichier rouge nomme le cas attendu', () => {
      expect(concludes({ ok: false, output: `FAIL ${attendu}` }, attendu)).toBe(true)
    })

    it('ne conclut pas sur un fichier qui passe', () => {
      expect(concludes({ ok: true, output: `${attendu} ok` }, attendu)).toBe(false)
      expect(concludes(undefined, attendu)).toBe(false)
    })

    // Un filtre sans correspondance fait sortir vitest en échec, ce qui se
    // lirait comme une mutation vue.
    it('ne prend pas un filtre sans correspondance pour un rouge', () => {
      const output = `No test files found, exiting with code 1\n${attendu}`

      expect(concludes({ ok: false, output }, attendu)).toBe(false)
    })

    // C'est là que se joue « vue ailleurs » : un autre cas du même fichier a
    // rougi, et la voie lente doit le diagnostiquer.
    it('ne conclut pas quand un autre cas du fichier a rougi', () => {
      const output = 'FAIL stories.test.ts > la lecture des stories > un autre cas'

      expect(concludes({ ok: false, output }, attendu)).toBe(false)
    })

    it('cible le fichier de `dans`, sinon celui de `attendu`', () => {
      expect(targetOf({ attendu, dans: 'ailleurs.test.ts' })).toBe('ailleurs.test.ts')
      expect(targetOf({ attendu })).toBe('stories.test.ts')
      expect(targetOf({ attendu: 'TS2339' })).toBeUndefined()
      expect(targetOf({ attendu: 'un titre sans fichier' })).toBeUndefined()
    })
  })

  // Le troisième mode de péremption, après le motif disparu et le motif ambigu :
  // renommer un test, ou son fichier, laisse une garantie qui n'attend plus rien.
  // C'est exactement ce que DCJ-210 s'apprête à faire sur 183 noms de tests.
  it('attend un cas qui existe vraiment', () => {
    const named = mutations.filter(({ attendu, dans }) => dans || NAMES_A_FILE.test(attendu))

    // Sans ce compte, une expression qui ne correspond plus à rien viderait la
    // boucle et le cas passerait sans rien vérifier.
    expect(named.length, 'aucune garantie ne nomme son fichier de test').toBeGreaterThan(50)

    for (const { garantie, attendu, dans } of named) {
      const segments = attendu.split(' > ')
      const file = dans ?? segments[0]
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
