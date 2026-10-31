import type { StoryEntry, TokensEntry } from '@crypte/core/protocol'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { dashboardOf, ORPHANS, READY } from '../src/health/dashboard'
import HealthPanel from '../src/health/health-panel.vue'
import type { HealthComponent } from '../src/health/health'
import { locale } from '../src/i18n'

// Le panneau de la santé : un composant, un token, les orphelins, les prêts, et
// rien pour un choix qui n'existe plus.

beforeEach(() => {
  locale.value = 'en'
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const composant = (name: string, over: Partial<HealthComponent> = {}): HealthComponent => ({
  name,
  file: `src/${name}.tsx`,
  export: name,
  stories: [`${name.toLowerCase()}--a`],
  props: 0,
  required: 0,
  status: 'stable',
  usedIn: ['src/app.tsx'],
  ...over,
})

const story = (name: string): StoryEntry => ({
  type: 'story',
  id: `${name.toLowerCase()}--a`,
  path: [name],
  name: 'a',
  component: { name, file: `src/${name}.tsx`, export: name },
  storyFile: `stories/${name}.tsx`,
  options: {},
  details: {},
  props: [],
  source: '',
})

const familles: TokensEntry[] = [
  {
    type: 'tokens',
    id: 'tokens--space',
    path: ['Tokens'],
    name: 'space',
    tokens: {
      '1': { type: 'dimension', themes: { light: { value: '4px' }, dark: { value: '6px' } } },
      '2': { type: 'dimension', themes: { light: { value: '8px' } } },
    },
  },
]

// Alpha ne rend pas, Beta n'a pas de page, Delta est prêt ; les deux premiers
// lisent space-1, et space-2 n'est lu par personne. Gamma, Theta et Eta n'ont
// pas de story ; les deux premiers ont un squelette.
const composants = [
  composant('Alpha', { tokens: ['space-1'], status: 'deprecated', statusSince: '2026-10-14' }),
  composant('Beta', { tokens: ['space-1'] }),
  composant('Gamma', {
    stories: [],
    required: 2,
    skeleton: { file: 'stories/Gamma.tsx', source: 'le squelette' },
  }),
  composant('Theta', { stories: [], skeleton: { file: 'stories/Theta.tsx', source: '' } }),
  composant('Eta', { stories: [] }),
  composant('Delta', { changed: new Date(Date.now() - 2 * 86_400_000).toISOString() }),
]
const histoires = ['Alpha', 'Beta', 'Delta'].map(story)
const dashboard = dashboardOf(composants, familles, {
  stories: histoires,
  pages: ['Alpha', 'Delta'].map((name) => ({
    type: 'page' as const,
    id: `page--${name}`,
    path: [],
    name,
    file: `stories/${name}.md`,
    body: '',
    storyFile: `stories/${name}.tsx`,
  })),
  audit: ['Alpha', 'Beta', 'Delta'].flatMap((name) =>
    (['light', 'dark'] as const).map((theme) =>
      name === 'Alpha'
        ? { id: 'alpha--a', theme, broken: 'Boom' }
        : { id: `${name.toLowerCase()}--a`, theme, passes: 1, violations: [] },
    ),
  ),
  components: composants,
  categories: [],
})

const monte = (item: string | null) =>
  mount(HealthPanel, {
    props: {
      dashboard,
      item,
      stories: histoires,
      families: familles,
      hrefOfStory: (id: string) => `?story=${id}`,
      hrefOfComponent: (id: string) => `?component=${id}`,
      hrefOfToken: (name: string) => `?tokens&token=${name}`,
      hrefOfChanges: '?changes',
    },
  })
const lignes = (wrapper: ReturnType<typeof monte>) =>
  wrapper.findAll('.rows > *').map((one) => one.text().replace(/\s+/g, ' '))

describe('the health panel', () => {
  test('details a component, criterion by criterion, and links to what fixes it', async () => {
    const wrapper = monte('src/Alpha.tsx:Alpha')
    expect(lignes(wrapper)).toMatchInlineSnapshot(`
      [
        "Alpha",
        "blocked, fails to render, light and dark · deprecated",
        "story1 story · ok",
        "renderfails to render · blocking",
        "a11y— · waiting",
        "docpage written · ok",
        "statusdeprecated since 14 Oct · to improve",
        "props0 · ok",
        "usages1 file · ok",
        "tokensreads 1",
        "to do, in order",
        "See the story a",
        "Open the page of Alpha",
      ]
    `)

    await wrapper.find('a.link').trigger('click')
    expect(wrapper.emitted('story')![0]![0]).toBe('alpha--a')
  })

  test('details a token, its values per theme and who reads it', async () => {
    const wrapper = monte('token:space-1')
    expect(lignes(wrapper)).toMatchInlineSnapshot(`
      [
        "--space-1",
        "read by components",
        "light4px",
        "dark6px",
        "read by 2: 1 blocking, 1 to improve, 0 ready",
        "Alpha",
        "Beta",
        "fix it once, 2 follow",
        "Fix it at the source, in the tokens view",
      ]
    `)

    await wrapper.find('a.link').trigger('click')
    expect(wrapper.emitted('token')![0]![0]).toBe('space-1')
  })

  // Sans story, la seule action est le fichier qui lui en donnerait une ; sans
  // squelette non plus, pas d'en-tête au-dessus d'une liste vide.
  test('gives the skeleton of a component without a story, and copies it', async () => {
    const écrit = vi.fn(async (_texte: string) => {})
    vi.stubGlobal('navigator', { clipboard: { writeText: écrit } })
    const wrapper = monte('src/Gamma.tsx:Gamma')
    expect(lignes(wrapper).slice(-4)).toMatchInlineSnapshot(`
      [
        "to do, in order",
        "stories/Gamma.tsxto create",
        "Copy the skeleton",
        "2 required props to fill in its Default story.",
      ]
    `)

    await wrapper.find('button.copy').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(écrit).toHaveBeenCalledWith('le squelette')
    expect(wrapper.find('button.copy').text()).toBe('Skeleton copied')
    await wrapper.setProps({ item: 'src/Theta.tsx:Theta' })
    expect(wrapper.find('button.copy').text()).toBe('Copy the skeleton')
    expect(lignes(wrapper).at(-1)).toBe('No required prop: its Default story is enough.')

    expect(lignes(monte('src/Eta.tsx:Eta'))).not.toContain('to do, in order')
  })

  test('lists the orphans by family', () => {
    expect(lignes(monte(ORPHANS))).toMatchInlineSnapshot(`
      [
        "1",
        "declared in the style sheet, read by no component and no alias",
        "space--space-2",
        "See them in the tokens view",
      ]
    `)
  })

  test('groups the ready components by usage, with the ones changed lately', async () => {
    const wrapper = monte(READY)
    expect(lignes(wrapper)).toMatchInlineSnapshot(`
      [
        "1",
        "every criterion green, nothing to fix, ready to publish",
        "less than 5Delta",
        "changed lately",
        "Delta2 d",
        "Publish a version",
        "See them in the stories view",
      ]
    `)

    await wrapper.find('a.link').trigger('click')
    expect(wrapper.emitted('changes')).toHaveLength(1)
  })

  test('draws nothing for a choice that is gone', () => {
    expect(monte('src/Gone.tsx:Gone').html()).toBe('<!--v-if-->')
    expect(monte('token:gone').html()).toBe('<!--v-if-->')
  })
})
