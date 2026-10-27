// Ce que `crypte visual` reconnaît comme une story renommée : une seule paire
// de chaque côté, au même composant, aux mêmes props et au même statut.

import type { FingerprintEntry } from '@crypte/core/protocol'
import { describe, expect, test } from 'vitest'
import { renamesOf } from '../src/commands/visual'

const story = (id: string, more: Partial<FingerprintEntry> = {}): FingerprintEntry => ({
  id,
  component: 'src/Badge.tsx#Badge',
  status: 'none',
  props: ['label', 'tone'],
  rest: `digest of ${id}`,
  ...more,
})

describe('a renamed story', () => {
  test('pairs the one story with no baseline and the one baseline left over', () => {
    expect(
      renamesOf(
        ['badge--alerte'],
        ['badge--avertissement'],
        [story('badge--avertissement')],
        [story('badge--alerte')],
      ),
    ).toEqual(new Map([['badge--alerte', 'badge--avertissement']]))
  })

  // Rien de proposé dès qu'un côté hésite, ni pour ce qui diffère d'un champ.
  test.for([
    ['another component', story('a', { component: 'src/Tag.tsx#Tag' })],
    ['other props', story('a', { props: ['label'] })],
    ['another status', story('a', { status: 'draft' })],
  ] as const)('proposes nothing for %s', ([, avant]) => {
    expect(renamesOf(['b'], ['a'], [avant], [story('b')])).toEqual(new Map())
  })

  test('proposes nothing when two baselines or two stories could match', () => {
    expect(renamesOf(['c'], ['a', 'b'], [story('a'), story('b')], [story('c')])).toEqual(new Map())
    expect(renamesOf(['b', 'c'], ['a'], [story('a')], [story('b'), story('c')])).toEqual(new Map())
  })

  test('reads only the stories with no baseline and the baselines left over', () => {
    expect(renamesOf(['b'], [], [story('a')], [story('b')])).toEqual(new Map())
    expect(renamesOf([], ['a'], [story('a')], [story('b')])).toEqual(new Map())
  })
})
