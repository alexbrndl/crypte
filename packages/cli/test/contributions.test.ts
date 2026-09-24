import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CryptePlugin, TokensEntry } from '@crypte/core/protocol'
import { describe, expect, it } from 'vitest'
import { buildCatalogue, type Catalogue } from '../src/manifest'
import { loadProject } from '../src/project'

// Ce qu'un plugin contribue au manifeste, et ce qui lui est refusé.
// Section 6.3 de docs/contracts.md.

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, 'fixture')
// Le seul projet du dépôt qui déclare un vrai plugin dans sa configuration.
const demo = join(here, '..', '..', '..', 'apps', 'demo')

// La fixture porte quatre stories, dont celle-ci, qui sert aux collisions.
const STORY = 'badge--default'

const tokens = (id: string): TokensEntry => ({
  type: 'tokens',
  id,
  path: ['Color'],
  name: 'Brand',
  tokens: { primary: { type: 'color', themes: { light: { value: '#4fe0a0' } } } },
})

// Le vrai projet, avec des plugins injectés : un `crypte.config.ts` qui importe
// un module de plugin ferait dépendre chaque cas d'un fichier sur disque.
async function build(...plugins: CryptePlugin[]): Promise<Catalogue> {
  const project = await loadProject(fixture)
  project.config.plugins = plugins

  return buildCatalogue(project)
}

// Un plugin dont le hook rend ce qu'on lui donne, ou lève ce qu'on lui donne.
const contributing = (name: string, produce: () => unknown): CryptePlugin => ({
  name,
  node: { entries: produce as () => TokensEntry[] },
})

const ids = (catalogue: Catalogue) => catalogue.manifest.entries.map((entry) => entry.id)

describe('what a plugin contributes', () => {
  it('ignores a plugin without a node surface', async () => {
    const catalogue = await build({ name: 'ui-only' })

    expect(ids(catalogue)).not.toContain('color--brand')
    expect(catalogue.skippedPlugins).toEqual([])
  })
})

describe('what a plugin is refused', () => {
  // La story gagne : elle vient du fichier de l'auteur, l'entrée du plugin non.
  it('refuses an entry that takes a story’s id', async () => {
    const catalogue = await build(contributing('greedy', () => [tokens(STORY)]))

    expect(ids(catalogue).filter((id) => id === STORY)).toHaveLength(1)
    expect(catalogue.skippedPlugins).toEqual([
      { plugin: 'greedy', reason: `\`${STORY}\` is already taken` },
    ])
  })

  it('refuses the second plugin the id the first one took', async () => {
    const catalogue = await build(
      contributing('first', () => [tokens('color--brand')]),
      contributing('second', () => [tokens('color--brand')]),
    )

    expect(ids(catalogue).filter((id) => id === 'color--brand')).toHaveLength(1)
    expect(catalogue.skippedPlugins).toEqual([
      { plugin: 'second', reason: '`color--brand` is already taken' },
    ])
  })

  it('refuses a hook that does not return an array', async () => {
    const catalogue = await build(contributing('confused', () => ({ nope: true })))

    expect(catalogue.skippedPlugins).toEqual([
      { plugin: 'confused', reason: 'the hook returned no array of entries' },
    ])
  })
})

// L'axe que la première version de ces cas n'a pas croisé : ce que le hook rend
// vraiment, et non un `TokensEntry` bien formé. Trois bloquants en sont sortis.
describe('what the hook actually returns', () => {
  it('refuses what is not an entry, and says so', async () => {
    const catalogue = await build(contributing('junk', () => [42, 'nope', {}]))

    expect(catalogue.manifest.entries).not.toContain(42)
    expect(catalogue.skippedPlugins).toEqual([
      { plugin: 'junk', reason: 'an entry is not an object' },
      { plugin: 'junk', reason: 'an entry is not an object' },
      { plugin: 'junk', reason: 'an entry has no identifier' },
    ])
  })

  it('refuses an entry without a known type', async () => {
    const catalogue = await build(
      contributing('odd', () => [{ id: 'x--y', type: 'page', path: [], name: 'x' }]),
    )

    expect(catalogue.skippedPlugins).toEqual([
      { plugin: 'odd', reason: '`x--y` is not a nature a plugin may contribute' },
    ])
  })

  // `Exclude` ne tient qu'à la compilation, et un plugin tiers arrive compilé.
  // Sans refus à l'exécution, l'entrée entre dans le manifeste et dans
  // `fingerprint.json`, qui est commité.
  it('refuses a contributed story, which typing alone could not stop', async () => {
    const story = {
      type: 'story',
      id: 'faux--story',
      path: ['Faux'],
      name: 'Story',
      component: { name: 'Faux', file: 'src/Faux.tsx', export: 'default' },
      storyFile: 'stories/Faux.ts',
      options: {},
      details: {},
      props: [],
      source: '<Faux />',
    }
    const catalogue = await build(contributing('sneaky', () => [story]))

    expect(ids(catalogue)).not.toContain('faux--story')
    expect(catalogue.skippedPlugins).toEqual([
      { plugin: 'sneaky', reason: '`faux--story` is not a nature a plugin may contribute' },
    ])
  })
})

// La garantie de la section 4.5, sur la première entrée qui ne soit pas
// sérialisable par construction.
describe('the serialization guarantee', () => {
  const refused = async (value: unknown) =>
    (await build(contributing('p', () => [{ ...tokens('color--brand'), extra: value }])))
      .skippedPlugins

  it('refuses a function, and locates it', async () => {
    expect(await refused(() => null)).toEqual([
      { plugin: 'p', reason: 'an entry carries a function at extra' },
    ])
  })

  it('refuses an undefined value, and locates it', async () => {
    expect(await refused(undefined)).toEqual([
      { plugin: 'p', reason: 'an entry carries undefined at extra' },
    ])
    expect(await refused([1, undefined])).toEqual([
      { plugin: 'p', reason: 'an entry carries undefined at extra[1]' },
    ])
  })

  // `JSON.stringify` lève sur un `bigint` et laisse tomber un `symbol`.
  it('refuses a bigint and a symbol', async () => {
    expect(await refused(1n)).toEqual([
      { plugin: 'p', reason: 'an entry carries a bigint at extra' },
    ])
    expect(await refused(Symbol('x'))).toEqual([
      { plugin: 'p', reason: 'an entry carries a symbol at extra' },
    ])
  })

  // `JSON.stringify` la rend en chaîne, donc ce qui revient n'est pas ce qui
  // est parti. Même raison pour une `Map` ou une instance de classe.
  it('refuses a Date', async () => {
    expect(await refused(new Date(0))).toEqual([
      { plugin: 'p', reason: 'an entry carries a Date value at extra' },
    ])
  })

  it('refuses a cycle rather than looping', async () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(await refused(cyclic)).toEqual([
      { plugin: 'p', reason: 'an entry carries a cycle at extra.self' },
    ])
  })

  // Deux noms résolus vers la même valeur : la forme la plus plausible pour
  // `@crypte/tokens`, et `JSON.stringify` la sérialise sans broncher.
  it('accepts two references to the same object, which is not a cycle', async () => {
    const shared = { type: 'color' as const, themes: { light: { value: '#4fe0a0' } } }
    const catalogue = await build(
      contributing('aliasing', () => [
        { ...tokens('color--brand'), tokens: { primary: shared, secondary: shared } },
      ]),
    )

    expect(catalogue.skippedPlugins).toEqual([])
    expect(ids(catalogue)).toContain('color--brand')
  })

  // `JSON.stringify` les rend `null`, donc le sens change sans un mot : c'est
  // exactement la mutation muette pour laquelle ce contrôle existe.
  it('refuses NaN and Infinity', async () => {
    expect(await refused(Number.NaN)).toEqual([
      { plugin: 'p', reason: 'an entry carries NaN at extra' },
    ])
    expect(await refused(Number.POSITIVE_INFINITY)).toEqual([
      { plugin: 'p', reason: 'an entry carries Infinity at extra' },
    ])
  })
})

// Le critère de fin du lot : un vrai plugin, déclaré par un vrai projet, écrit
// une entrée dans son manifeste sans qu'aucune ligne du noyau ne connaisse les
// tokens. Sur la démonstration, pas sur la fixture, parce que c'est elle qui
// porte une feuille de style et un `crypte.config.ts` complet.
describe('the demo, end to end', () => {
  it('carries a tokens entry produced by @crypte/tokens', async () => {
    const catalogue = buildCatalogue(await loadProject(demo))
    const entries = catalogue.manifest.entries.filter((entry) => entry.type === 'tokens')

    expect(catalogue.skippedPlugins).toEqual([])
    expect(entries.map((entry) => entry.id)).toEqual([
      'tokens--color',
      'tokens--radius',
      'tokens--size',
      'tokens--space',
    ])
  })

  // Le thème sombre vient d'un `@media`, et l'alias d'un `var()` : les deux
  // formes que la lecture naïve manque.
  it('reads the demo’s dark theme and alias chain', async () => {
    const catalogue = buildCatalogue(await loadProject(demo))
    const colors = catalogue.manifest.entries.find((entry) => entry.id === 'tokens--color')

    expect(colors?.type === 'tokens' && colors.tokens.neutral?.themes).toEqual({
      default: { value: '#e5e7eb' },
      dark: { value: '#374151' },
    })
    // `themes` entier, pas `.default` seul : c'est ce raccourci qui a laissé
    // passer un alias sans valeur sombre alors que sa cible en avait une.
    expect(colors?.type === 'tokens' && colors.tokens['badge-background']?.themes).toEqual({
      default: { value: '#e5e7eb', alias: ['color-neutral'] },
      dark: { value: '#374151', alias: ['color-neutral'] },
    })
  })
})
