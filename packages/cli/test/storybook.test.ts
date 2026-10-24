import type { Manifest, StoryEntry } from '@crypte/core/protocol'
import { describe, expect, test } from 'vitest'
import { storybookIndexOf } from '../src/catalogue/storybook'

// `index.json` à la forme d'un Storybook construit : ce que zeroheight, Supernova
// et Knapsack lisent avant d'intégrer chaque story par `iframe.html?id=`.

const story = (over: Partial<StoryEntry>): StoryEntry => ({
  type: 'story',
  id: 'badge--defaut',
  path: ['Badge'],
  name: 'Défaut',
  component: { name: 'Badge', file: 'src/Badge.tsx', export: 'Badge' },
  storyFile: 'stories/Badge.tsx',
  options: {},
  details: {},
  props: [],
  source: '<Badge />',
  ...over,
})

describe('the Storybook index', () => {
  test('lists each story by its id, its path as title, and its story file', () => {
    const manifest: Manifest = {
      version: 1,
      entries: [
        story({}),
        story({
          id: 'checkout/order-summary--vide',
          path: ['checkout', 'OrderSummary'],
          name: 'Vide',
          storyFile: 'stories/checkout/OrderSummary.tsx',
        }),
      ],
    } as Manifest

    expect(storybookIndexOf(manifest)).toMatchInlineSnapshot(`
      {
        "entries": {
          "badge--defaut": {
            "id": "badge--defaut",
            "importPath": "./stories/Badge.tsx",
            "name": "Défaut",
            "tags": [
              "dev",
              "test",
            ],
            "title": "Badge",
            "type": "story",
          },
          "checkout/order-summary--vide": {
            "id": "checkout/order-summary--vide",
            "importPath": "./stories/checkout/OrderSummary.tsx",
            "name": "Vide",
            "tags": [
              "dev",
              "test",
            ],
            "title": "checkout/OrderSummary",
            "type": "story",
          },
        },
        "v": 5,
      }
    `)
  })

  // Une page ou une famille de tokens n'a pas d'`iframe.html` à intégrer.
  test('leaves out what is not a story', () => {
    const manifest = {
      version: 1,
      entries: [
        { type: 'page', id: 'guide', path: [], name: 'Guide', file: 'stories/guide.md', body: '' },
        { type: 'tokens', id: 'couleurs', path: ['Couleurs'], name: 'Couleurs', tokens: [] },
      ],
    } as unknown as Manifest

    expect(storybookIndexOf(manifest)).toEqual({ v: 5, entries: {} })
  })
})
