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

describe('ce qu’un plugin contribue', () => {
  it('ne contribue rien sans plugin, et rien de plus qu’avant', async () => {
    const catalogue = await build()

    expect(catalogue.manifest.entries.every((entry) => entry.type === 'story')).toBe(true)
    expect(catalogue.skippedPlugins).toEqual([])
  })

  it('ignore un plugin sans surface node', async () => {
    const catalogue = await build({ name: 'ui-only' })

    expect(ids(catalogue)).not.toContain('color--brand')
    expect(catalogue.skippedPlugins).toEqual([])
  })

  // Après les stories, et c'est ce qui décide de la collision plus bas.
  it('ajoute l’entrée après les stories', async () => {
    const catalogue = await build(contributing('tokens', () => [tokens('color--brand')]))

    expect(ids(catalogue).at(-1)).toBe('color--brand')
    expect(catalogue.manifest.entries.at(-1)?.type).toBe('tokens')
  })

  // L'ordre de `plugins`, pas un champ `order` que chacun mettrait à zéro.
  it('suit l’ordre de plugins', async () => {
    const catalogue = await build(
      contributing('second', () => [tokens('b--one')]),
      contributing('first', () => [tokens('a--two')]),
    )

    expect(ids(catalogue).slice(-2)).toEqual(['b--one', 'a--two'])
  })
})

describe('ce qui est refusé à un plugin', () => {
  // La story gagne : elle vient du fichier de l'auteur, l'entrée du plugin non.
  it('refuse une entrée qui prend l’identifiant d’une story', async () => {
    const catalogue = await build(contributing('greedy', () => [tokens(STORY)]))

    expect(ids(catalogue).filter((id) => id === STORY)).toHaveLength(1)
    expect(catalogue.skippedPlugins).toEqual([
      { plugin: 'greedy', reason: `\`${STORY}\` is already taken` },
    ])
  })

  it('refuse au second plugin l’identifiant que le premier a pris', async () => {
    const catalogue = await build(
      contributing('first', () => [tokens('color--brand')]),
      contributing('second', () => [tokens('color--brand')]),
    )

    expect(ids(catalogue).filter((id) => id === 'color--brand')).toHaveLength(1)
    expect(catalogue.skippedPlugins).toEqual([
      { plugin: 'second', reason: '`color--brand` is already taken' },
    ])
  })

  // Non fatal : le catalogue garde les stories qu'il a déjà lues.
  it('refuse un hook qui lève, et garde les stories', async () => {
    const catalogue = await build(
      contributing('broken', () => {
        throw new Error('no tokens file')
      }),
    )

    expect(catalogue.manifest.entries.length).toBeGreaterThan(0)
    expect(catalogue.skippedPlugins).toEqual([{ plugin: 'broken', reason: 'no tokens file' }])
  })

  it('refuse un hook qui ne rend pas un tableau', async () => {
    const catalogue = await build(contributing('confused', () => ({ nope: true })))

    expect(catalogue.skippedPlugins).toEqual([
      { plugin: 'confused', reason: 'the hook returned no array of entries' },
    ])
  })
})

// L'axe que la première version de ces cas n'a pas croisé : ce que le hook rend
// vraiment, et non un `TokensEntry` bien formé. Trois bloquants en sont sortis.
describe('ce que le hook rend vraiment', () => {
  it('refuse ce qui n’est pas une entrée, en le disant', async () => {
    const catalogue = await build(contributing('junk', () => [42, 'nope', {}]))

    expect(ids(catalogue)).not.toContain(42)
    expect(catalogue.skippedPlugins).toEqual([
      { plugin: 'junk', reason: 'an entry is not an object' },
      { plugin: 'junk', reason: 'an entry is not an object' },
      { plugin: 'junk', reason: 'an entry has no identifier' },
    ])
  })

  it('refuse une entrée sans type connu', async () => {
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
  it('refuse une story contribuée, que le typage seul ne pouvait pas arrêter', async () => {
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
describe('la garantie de sérialisation', () => {
  const refused = async (value: unknown) =>
    (await build(contributing('p', () => [{ ...tokens('color--brand'), extra: value }])))
      .skippedPlugins

  it('refuse une fonction, en la situant', async () => {
    expect(await refused(() => null)).toEqual([
      { plugin: 'p', reason: 'an entry carries a function at extra' },
    ])
  })

  it('refuse une valeur undefined, en la situant', async () => {
    expect(await refused(undefined)).toEqual([
      { plugin: 'p', reason: 'an entry carries undefined at extra' },
    ])
    expect(await refused([1, undefined])).toEqual([
      { plugin: 'p', reason: 'an entry carries undefined at extra[1]' },
    ])
  })

  // `JSON.stringify` lève sur un `bigint` et laisse tomber un `symbol`.
  it('refuse un bigint et un symbol', async () => {
    expect(await refused(1n)).toEqual([
      { plugin: 'p', reason: 'an entry carries a bigint at extra' },
    ])
    expect(await refused(Symbol('x'))).toEqual([
      { plugin: 'p', reason: 'an entry carries a symbol at extra' },
    ])
  })

  // `JSON.stringify` la rend en chaîne, donc ce qui revient n'est pas ce qui
  // est parti. Même raison pour une `Map` ou une instance de classe.
  it('refuse une Date', async () => {
    expect(await refused(new Date(0))).toEqual([
      { plugin: 'p', reason: 'an entry carries a Date value at extra' },
    ])
  })

  it('refuse un cycle plutôt que de boucler', async () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(await refused(cyclic)).toEqual([
      { plugin: 'p', reason: 'an entry carries a cycle at extra.self' },
    ])
  })

  it('situe une valeur enfouie dans un tableau', async () => {
    expect(await refused([{ deep: [() => null] }])).toEqual([
      { plugin: 'p', reason: 'an entry carries a function at extra[0].deep[0]' },
    ])
  })

  // Deux noms résolus vers la même valeur : la forme la plus plausible pour
  // `@crypte/tokens`, et `JSON.stringify` la sérialise sans broncher.
  it('accepte deux références au même objet, qui n’est pas un cycle', async () => {
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
  it('refuse NaN et Infinity', async () => {
    expect(await refused(Number.NaN)).toEqual([
      { plugin: 'p', reason: 'an entry carries NaN at extra' },
    ])
    expect(await refused(Number.POSITIVE_INFINITY)).toEqual([
      { plugin: 'p', reason: 'an entry carries Infinity at extra' },
    ])
  })

  // Laisser tomber la clé plutôt que refuser a été essayé et repris : aucune
  // nature contribuable n'a de propriété optionnelle, donc l'abandon écrivait en
  // silence une entrée qui ne satisfait plus le format. Revue de la PR #51.
  it('refuse une clé requise laissée à undefined plutôt que de l’abandonner', async () => {
    const catalogue = await build(
      contributing('p', () => [{ ...tokens('color--brand'), tokens: undefined }]),
    )

    expect(catalogue.skippedPlugins).toEqual([
      { plugin: 'p', reason: 'an entry carries undefined at tokens' },
    ])
    expect(ids(catalogue)).not.toContain('color--brand')
  })

  it('accepte une entrée que JSON rend telle quelle', async () => {
    const catalogue = await build(contributing('p', () => [tokens('color--brand')]))
    const written = JSON.parse(JSON.stringify(catalogue.manifest)) as typeof catalogue.manifest

    expect(catalogue.skippedPlugins).toEqual([])
    expect(written).toEqual(catalogue.manifest)
  })
})
