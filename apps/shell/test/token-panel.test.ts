import type { StoryEntry, TokensEntry } from '@crypte/core/protocol'
import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
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

const monte = (name: string | null) =>
  mount(TokenPanel, {
    props: {
      token: name === null ? null : tokenNamed(name),
      categories,
      stories,
      hrefOfToken: (category: string, token: string) => `?tokens=${category}&token=${token}`,
      hrefOfComponent: (id: string) => `?component=${id}`,
    },
  })
const lignes = (wrapper: ReturnType<typeof monte>) =>
  wrapper.findAll('.body > *').map((one) => one.text().replace(/\s+/g, ' ').trim())

describe('the token panel', () => {
  test('gives each theme with the end of its chain, the CSS name, what points here and what reads it', () => {
    const wrapper = monte('accent-base')

    expect(wrapper.find('h3').text()).toBe('accent-base')
    expect(wrapper.find('.source').text()).toBe('token')
    expect(lignes(wrapper)).toEqual([
      'value',
      'light teal-700 · #00776e',
      'dark teal-500 · #00b9a6',
      'css var(--accent-base)',
      'aliases pointing here · 1',
      'accent-focus color',
      'used by · 1 component',
      'Button src/Button.tsx',
    ])
    expect(wrapper.findAll('a').map((one) => one.attributes('href'))).toEqual([
      '?tokens=color&token=accent-focus',
      '?component=ui/button',
    ])
  })

  // Un token sans alias ni lecteur : ni la ligne des alias, ni un compte faux.
  test('says no component reads a token nobody reads, and lists no alias it lacks', () => {
    expect(lignes(monte('teal-500'))).toEqual([
      'value',
      'default #00b9a6',
      'css var(--teal-500)',
      'aliases pointing here · 1',
      'accent-base color',
      'used by · 0 components',
      'No component reads it.',
    ])
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
