import type { StoryEntry, TokensEntry } from '@crypte/core/protocol'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, test } from 'vitest'
import { categoriesOf } from '../src/tokens/categories'
import TokenPanel from '../src/tokens/token-panel.vue'

// Le panneau d'un token : ses valeurs, son nom CSS, ce qui pointe vers lui et ce
// qui le lit.

const families: TokensEntry[] = [
  {
    type: 'tokens',
    id: 'tokens--teal',
    path: ['Tokens'],
    name: 'teal',
    tokens: {
      '700': { type: 'color', themes: { default: { value: '#00776e' } } },
      '500': { type: 'color', themes: { default: { value: '#00b9a6' } } },
    },
  },
  {
    type: 'tokens',
    id: 'tokens--accent',
    path: ['Tokens'],
    name: 'accent',
    tokens: {
      base: {
        type: 'color',
        themes: {
          light: { value: '#00776e', alias: ['teal-700'] },
          dark: { value: '#00b9a6', alias: ['teal-500'] },
        },
      },
      focus: {
        type: 'color',
        themes: { light: { value: '#00776e', alias: ['accent-base', 'teal-700'] } },
      },
    },
  },
]
const categories = categoriesOf(families)
const tokenNamed = (name: string) =>
  categories.flatMap((one) => one.groups.flatMap((g) => g.tokens)).find((t) => t.name === name)!

const story = (id: string, path: string[], file: string, tokens?: string[]): StoryEntry => ({
  type: 'story',
  id,
  name: id,
  path,
  storyFile: `stories/${path.at(-1)}.ts`,
  component: { name: path.at(-1)!, file, export: 'default', ...(tokens ? { tokens } : {}) },
  options: {},
  details: {},
  props: [],
  source: '',
})
const stories = [
  story('ui/button--a', ['ui', 'Button'], 'src/Button.tsx', ['accent-base', 'space-2']),
  story('ui/button--b', ['ui', 'Button'], 'src/Button.tsx', ['accent-base', 'space-2']),
  story('badge--a', ['Badge'], 'src/Badge.tsx', ['text-primary']),
  story('tag--a', ['Tag'], 'src/Tag.tsx'),
]

const monte = (name: string | null, tried: Record<string, string> = {}) =>
  mount(TokenPanel, {
    props: {
      token: name === null ? null : tokenNamed(name),
      tried,
      categories,
      stories,
      hrefOfToken: (category: string, token: string) => `?tokens=${category}&token=${token}`,
      hrefOfComponent: (id: string) => `?component=${id}`,
      hrefOfStory: (id: string) => `?id=${id}`,
    },
  })
const lignes = (wrapper: ReturnType<typeof monte>) =>
  wrapper.findAll('.rows > *').map((one) => one.text().replace(/\s+/g, ' ').trim())

beforeEach(() => {
  localStorage.clear()
})

describe('the token panel', () => {
  test('gives each theme with the end of its chain, the CSS name, what points here and what reads it', () => {
    const wrapper = monte('accent-base')

    expect(wrapper.find('h3').text()).toBe('accent/base')
    expect(wrapper.find('.head .note').exists()).toBe(false)
    expect(lignes(wrapper)).toEqual([
      'value',
      'light teal/700 · #00776E',
      'dark teal/500 · #00B9A6',
      'css var(--accent-base)',
      'try a value',
      '',
      'aliases pointing here · 1',
      'accent/focus color',
      'used by · 1 component',
      'Button ui',
    ])
    expect(wrapper.findAll('a').map((one) => one.attributes('href'))).toEqual([
      '?tokens=color&token=accent-focus',
      '?component=ui/button',
    ])
  })

  // Un token que rien ne vise ni ne lit : pas de ligne des alias, et un compte nul.
  test('says no component reads a token nobody reads, and lists no alias it lacks', () => {
    const wrapper = monte('accent-focus')

    expect(lignes(wrapper)).toEqual([
      'value',
      'light teal/700 · #00776E',
      'css var(--accent-focus)',
      'try a value',
      '',
      'used by · 0 components',
      'No component reads it.',
    ])
    expect(wrapper.findAll('a')).toHaveLength(0)
  })

  // Une primitive visée par un thème seulement compte quand même.
  test('counts a token that aims at it in one theme only', () => {
    expect(lignes(monte('teal-500')).slice(5, 7)).toEqual([
      'aliases pointing here · 1',
      'accent/base color',
    ])
  })

  // Retenu d'un montage à l'autre, comme les panneaux des stories.
  test('folds its body from its head, and remembers it', async () => {
    const wrapper = monte('accent-base')
    const bouton = wrapper.find('.toggle')

    expect(bouton.attributes('aria-expanded')).toBe('true')
    await bouton.trigger('click')
    expect(bouton.attributes('aria-expanded')).toBe('false')
    expect((wrapper.find('.body').element as HTMLElement).style.display).toBe('none')
    expect(monte('accent-base').find('.toggle').attributes('aria-expanded')).toBe('false')

    await bouton.trigger('click')
    expect(localStorage.getItem('crypte:panel:shell:token')).toBeNull()
  })

  test('asks for a token when none is selected', () => {
    const wrapper = monte(null)

    expect(wrapper.find('h3').text()).toBe('Token')
    expect(lignes(wrapper)).toEqual(['Select a token to see its values and its uses.'])
  })

  test('hands back the token or the component a row leads to', async () => {
    const wrapper = monte('accent-base')
    const [alias, composant] = wrapper.findAll('a')

    await alias!.trigger('click')
    await composant!.trigger('click')
    expect(wrapper.emitted('token')?.[0]?.slice(0, 2)).toEqual(['color', 'accent-focus'])
    expect(wrapper.emitted('component')?.[0]?.[0]).toBe('ui/button')
  })
})

// Une valeur essayée part au shell à chaque frappe ; Reset revient au fichier.
// Essayée, la liste dit ce qu'elle touche : les lecteurs du token, et ceux des
// tokens dont la chaîne passe par lui.
describe('a value tried', () => {
  test('goes to the shell as it is written, and Reset takes it back', async () => {
    const wrapper = monte('accent-base')
    const champ = wrapper.find('.try input')
    expect(wrapper.find('.try .reset').exists()).toBe(false)
    await champ.setValue('  #e11d48 ')
    await champ.setValue('')
    expect(wrapper.emitted('try')).toEqual([
      ['accent-base', '#e11d48'],
      ['accent-base', null],
    ])

    const essayé = monte('accent-base', { 'accent-base': '#e11d48' })
    expect((essayé.find('.try input').element as HTMLInputElement).value).toBe('#e11d48')
    await essayé.find('.try .reset').trigger('click')
    expect(essayé.emitted('try')).toEqual([['accent-base', null]])
  })

  test('lists what it affects, through the aliases that point at the token', () => {
    expect(lignes(monte('teal-700')).slice(-2)).toEqual([
      'used by · 0 components',
      'No component reads it.',
    ])
    const essayé = monte('teal-700', { 'teal-700': '#000' })
    expect(lignes(essayé).slice(-2)).toEqual(['affected · 1 component', 'Button ui'])
    // Essayée, le composant mène à sa première story, où la preview se voit.
    expect(essayé.find('a.link[href^="?id="]').attributes('href')).toBe('?id=ui/button--a')
    expect(lignes(monte('accent-base')).at(-1)).toBe('Button ui')
    expect(monte('accent-base').findAll('a.link').at(-1)!.attributes('href')).toBe(
      '?component=ui/button',
    )
  })
})
