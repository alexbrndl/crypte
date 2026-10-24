// The catalogue in the shape a built Storybook publishes, `index.json`, which
// zeroheight, Supernova and Knapsack read to list stories and then embed each
// one from `iframe.html?id=`. A compatibility export, never Crypte's own format:
// if Storybook changes it, this file follows and nothing else moves.

import type { Manifest } from '@crypte/core/protocol'
import { storiesOf } from './manifest'

export const STORYBOOK_INDEX = '/index.json'

// The page that renders one story with no shell, at the address those tools build.
export const STORYBOOK_IFRAME = '/iframe.html'

export interface StorybookEntry {
  type: 'story'
  id: string
  title: string
  name: string
  importPath: string
  tags: string[]
}

export interface StorybookIndex {
  v: 5
  entries: Record<string, StorybookEntry>
}

// Stories only: a page or a family of tokens has no `iframe.html` to embed. The
// two tags are the ones Storybook gives every story, and a reader filtering on
// them would otherwise drop every entry.
export function storybookIndexOf(manifest: Manifest): StorybookIndex {
  return {
    v: 5,
    entries: Object.fromEntries(
      storiesOf(manifest).map((entry) => [
        entry.id,
        {
          type: 'story',
          id: entry.id,
          title: entry.path.join('/'),
          name: entry.name,
          importPath: `./${entry.storyFile}`,
          tags: ['dev', 'test'],
        },
      ]),
    ),
  }
}
