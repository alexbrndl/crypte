import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Manifest, StoryEntry, TokensEntry } from '@crypte/core/protocol'
import { describe, expect, it } from 'vitest'
import { FINGERPRINT, fingerprintOf, writeFingerprint } from '../src/fingerprint'
import { buildCatalogue, storiesOf } from '../src/manifest'
import { loadProject } from '../src/project'

// L'empreinte commitée., « Ce que le condensé
// garde de chaque story ».

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, 'fixture')
// Le seul projet du dépôt qui porte de vraies stories et un vrai adaptateur :
// son empreinte verrouille donc le producteur contre autre chose qu'une fixture.
const demo = join(here, '..', '..', '..', 'apps', 'demo')

const entry: StoryEntry = {
  type: 'story',
  id: 'badge--default',
  path: ['Badge'],
  name: 'Default',
  component: { name: 'Badge', file: 'src/Badge.tsx', export: 'default' },
  storyFile: 'stories/Badge.ts',
  options: {},
  details: {},
  props: ['label'],
  source: '<Badge label="x" />',
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const one = (over: Partial<StoryEntry> = {}): Manifest => ({
  version: 1,
  entries: [{ ...entry, ...over }],
})

describe('reduced fingerprint', () => {
  // Le producteur trie déjà. Ce tri-ci tient la règle du condensé, qui dépend de
  // ce qu'une entrée porte et jamais de l'ordre où c'est écrit : `stable` fait
  // la même chose des clés d'objet. Réordonner un bloc de props dans un fichier
  // de story change en revanche `source`, donc le condensé.
  it('sorts the props of a manifest that did not', () => {
    const a = fingerprintOf(one({ props: ['a', 'b'] }))
    const b = fingerprintOf(one({ props: ['b', 'a'] }))

    expect(same(a, b)).toBe(true)
  })

  // Ce qui n'est pas à découvert doit quand même bouger l'empreinte, sinon un
  // changement de code d'appel passerait inaperçu.
  //
  // Chaque cas ne change **que** le champ replié qu'il vise, statut compris : le
  // premier jet comparait une entrée sans `meta` à une entrée `status: 'stable'`,
  // donc la comparaison échouait sur le champ à découvert et le repliement de
  // `meta` n'était gardé par rien.
  it('folds into a fingerprint everything it does not show', () => {
    const stable = { status: 'stable' } as const
    const before = fingerprintOf(one({ meta: stable }))

    for (const over of [
      { source: '<Badge label="autre" />' },
      { storyFile: 'stories/autre.ts' },
      { name: 'Autre' },
      // `type` n'est pas de la liste : c'est un littéral unique, donc il ne peut
      // pas varier sans un cast, et le reposer ici n'éprouvait que `path`.
      { path: ['badge'] },
      { options: { responsive: 'mobile' } },
      { details: { label: { type: 'string', required: true } } },
      { component: { name: 'Autre', file: 'src/Badge.tsx', export: 'default' } },
      { meta: { ...stable, owner: 'design' } },
      { meta: { ...stable, figma: 'https://figma.com/x' } },
      { meta: { ...stable, description: 'une note' } },
    ] satisfies Partial<StoryEntry>[]) {
      const after = fingerprintOf(one({ meta: stable, ...over }))

      expect(same(before, after), JSON.stringify(over)).toBe(false)
    }
  })

  // Réordonner les props d'une story change `source`, qui garde l'ordre de
  // l'auteur puisqu'elle s'affiche, et pas le rendu. Le condensé compare les
  // attributs triés, sans perdre ni une valeur changée ni les enfants.
  it('stays still when only source attributes change order', () => {
    const ordre = (source: string) => fingerprintOf(one({ source }))

    expect(
      same(ordre('<Badge tone="calm" label="x" />'), ordre('<Badge label="x" tone="calm" />')),
    ).toBe(true)
    expect(
      same(
        ordre('<Badge on={() => 1} label="x">Texte</Badge>'),
        ordre('<Badge label="x" on={() => 1}>Texte</Badge>'),
      ),
    ).toBe(true)
    expect(
      same(ordre('<Badge tone="calm" label="x" />'), ordre('<Badge label="y" tone="calm" />')),
    ).toBe(false)
    expect(same(ordre('<Badge label="x">Un</Badge>'), ordre('<Badge label="x">Deux</Badge>'))).toBe(
      false,
    )
  })

  // Les clés du premier niveau arrivent déjà triées par `digestOf`, donc c'est
  // sur un objet imbriqué que le tri de `stable` se mesure. Sans ce cas, retirer
  // ce tri ne faisait rougir personne.
  it('does not depend on the key order of a nested object', () => {
    const alphabetical = fingerprintOf(
      one({ details: { label: { type: 'string', required: true, description: 'x' } } }),
    )
    const shuffled = fingerprintOf(
      one({ details: { label: { description: 'x', required: true, type: 'string' } } }),
    )

    expect(same(alphabetical, shuffled)).toBe(true)
  })

  it('follows the manifest version', () => {
    expect(fingerprintOf({ version: 2, entries: [] }).version).toBe(2)
  })
})

describe('fixture fingerprint', () => {
  // Ce cas **écrit** le fichier commité : c'est lui le générateur, et le régime
  // de verrouillage est l'étape `git diff --exit-code` déjà en place en
  // intégration continue, celle qui garde les réexports générés. Un producteur
  // qui change sans que le fichier soit recommité fait donc rougir la CI, et le
  // moyen de la réparer est de lancer la suite.
  it('is written next to the manifest', async () => {
    for (const root of [fixture, demo]) {
      const { manifest } = buildCatalogue(await loadProject(root))
      const built = fingerprintOf(manifest)
      const file = writeFingerprint(root, built)

      // Une ligne par **story**, pas par entrée : la section 4.6 dit que
      // l'empreinte répond « ce qui a changé au catalogue de composants », pas
      // « ce qui a changé au manifeste ». La démonstration porte des entrées
      // tokens depuis `DCJ-233`, donc les deux comptes diffèrent chez elle.
      expect(built.entries, root).toHaveLength(storiesOf(manifest).length)
      expect(built.entries.length, root).toBeLessThanOrEqual(manifest.entries.length)
      expect(file, root).toBe(join(root, FINGERPRINT))
      expect(JSON.parse(readFileSync(file, 'utf8')), root).toEqual(built)
    }
  })
})
