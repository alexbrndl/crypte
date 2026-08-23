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

  it('refuse une valeur undefined', async () => {
    expect(await refused(undefined)).toEqual([
      { plugin: 'p', reason: 'an entry carries undefined at extra' },
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

  it('accepte une entrée que JSON rend telle quelle', async () => {
    const catalogue = await build(contributing('p', () => [tokens('color--brand')]))
    const written = JSON.parse(JSON.stringify(catalogue.manifest)) as typeof catalogue.manifest

    expect(catalogue.skippedPlugins).toEqual([])
    expect(written).toEqual(catalogue.manifest)
  })
})
