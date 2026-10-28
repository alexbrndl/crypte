// Ce que `crypte visual` reconnaît comme une story renommée : une seule paire
// de chaque côté, au même composant, aux mêmes props et au même statut.

import type { FingerprintEntry } from '@crypte/core/protocol'
import { describe, expect, test } from 'vitest'
import { firstRun, moveOf, renamesOf } from '../src/commands/visual'

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

// `git mv` ne crée pas de dossier : la commande le crée quand l'id en change.
describe('the command that keeps a baseline', () => {
  test.for([
    ['badge--a', 'badge--b', 'git mv .crypte/visual/badge--a.png .crypte/visual/badge--b.png'],
    [
      'badge--a',
      'forms/badge--a',
      'mkdir -p .crypte/visual/forms && git mv .crypte/visual/badge--a.png .crypte/visual/forms/badge--a.png',
    ],
  ] as const)('moves %s to %s', ([avant, après, commande]) => {
    expect(moveOf(avant, après)).toBe(commande)
  })
})

// Le premier lancement, et seulement lui : sans baseline orpheline, qui peut
// être celle d'une story renommée, et avec au moins une story.
describe('a first run of crypte visual', () => {
  test.for([
    ['every story without a baseline', 3, 3, 0, true],
    ['a baseline left over', 3, 3, 1, false],
    ['one story with its baseline', 3, 2, 0, false],
    ['no story at all', 0, 0, 0, false],
  ] as const)('%s', ([, stories, missing, stale, attendu]) => {
    expect(firstRun(stories, missing, stale)).toBe(attendu)
  })
})
