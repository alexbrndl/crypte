import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Manifest, StoryEntry } from '@crypte/core/protocol'
import { describe, expect, it } from 'vitest'
import { FINGERPRINT, fingerprintOf, writeFingerprint } from '../src/fingerprint'
import { buildCatalogue } from '../src/manifest'
import { loadProject } from '../src/project'

// L'empreinte commitée. Voir docs/decisions.md, « The manifest is a build
// artefact, and a small fingerprint is committed ».

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, 'fixture')

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

describe('l’empreinte réduite', () => {
  it('garde à découvert ce qui doit se lire dans un diff', () => {
    const [first] = fingerprintOf(one({ meta: { status: 'stable' } })).entries

    expect(first).toMatchObject({
      id: 'badge--default',
      component: 'src/Badge.tsx#default',
      status: 'stable',
      props: ['label'],
    })
    expect(first?.rest).toMatch(/^[0-9a-f]{16}$/)
  })

  // Sans statut par défaut, ajouter `status: 'draft'` ne changerait rien du tout
  // dans l'empreinte, alors que c'est exactement ce qu'elle sert à suivre.
  it('donne un statut à une story qui n’en déclare aucun', () => {
    expect(fingerprintOf(one()).entries[0]?.status).toBe('none')
    expect(fingerprintOf(one({ meta: { status: 'draft' } })).entries[0]?.status).toBe('draft')
  })

  // Le producteur trie déjà, donc ce tri est une défense pour un manifeste venu
  // d'ailleurs. Réordonner un bloc de props dans un fichier de story change en
  // revanche `source`, donc le condensé : le nom de ce cas l'affirmait à tort.
  it('trie les props d’un manifeste qui ne l’aurait pas fait', () => {
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
  it('replie dans une empreinte tout ce qu’elle ne montre pas', () => {
    const stable = { status: 'stable' } as const
    const before = fingerprintOf(one({ meta: stable }))

    for (const over of [
      { source: '<Badge label="autre" />' },
      { storyFile: 'stories/autre.ts' },
      { name: 'Autre' },
      { type: 'story', path: ['badge'] },
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

  // `JSON.stringify` garde l'ordre d'insertion, donc sans tri l'empreinte
  // changeait quand le producteur écrivait les mêmes champs dans un autre ordre.
  it('ne dépend pas de l’ordre où les champs sont écrits', () => {
    const reordered: StoryEntry = {
      source: entry.source,
      props: entry.props,
      details: entry.details,
      options: entry.options,
      storyFile: entry.storyFile,
      component: entry.component,
      name: entry.name,
      path: entry.path,
      id: entry.id,
      type: entry.type,
    }

    expect(same(fingerprintOf(one()), fingerprintOf({ version: 1, entries: [reordered] }))).toBe(
      true,
    )
  })

  // Les clés du premier niveau arrivent déjà triées par `digestOf`, donc c'est
  // sur un objet imbriqué que le tri de `stable` se mesure. Sans ce cas, retirer
  // ce tri ne faisait rougir personne.
  it('ne dépend pas de l’ordre des clés d’un objet imbriqué', () => {
    const alphabetical = fingerprintOf(
      one({ details: { label: { type: 'string', required: true, description: 'x' } } }),
    )
    const shuffled = fingerprintOf(
      one({ details: { label: { description: 'x', required: true, type: 'string' } } }),
    )

    expect(same(alphabetical, shuffled)).toBe(true)
  })

  it('suit la version du manifeste', () => {
    expect(fingerprintOf({ version: 2, entries: [] }).version).toBe(2)
  })
})

describe('l’empreinte de la fixture', () => {
  // Ce cas **écrit** le fichier commité : c'est lui le générateur, et le régime
  // de verrouillage est l'étape `git diff --exit-code` déjà en place en
  // intégration continue, celle qui garde les réexports générés. Un producteur
  // qui change sans que le fichier soit recommité fait donc rougir la CI, et le
  // moyen de la réparer est de lancer la suite.
  it('est écrite à côté du manifeste', async () => {
    const { manifest } = buildCatalogue(await loadProject(fixture))
    const built = fingerprintOf(manifest)
    const file = writeFingerprint(fixture, built)

    expect(built.entries).toHaveLength(manifest.entries.length)
    expect(file).toBe(join(fixture, FINGERPRINT))
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(built)
  })
})
