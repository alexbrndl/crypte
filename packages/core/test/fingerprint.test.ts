import { describe, expect, test } from 'vitest'
import {
  compareFingerprints,
  readFingerprint,
  type Fingerprint,
  type FingerprintEntry,
  type FingerprintToken,
} from '../src/protocol/fingerprint'

// Ce qui a changé entre deux empreintes, que le CLI lit dans Git et le shell
// d'un build sur GitHub : une seule comparaison pour les deux.

const FROM = { ref: 'v1', commit: 'abcdef0' }
const entrée = (id: string, props: string[], status = 'none', rest = 'r'): FingerprintEntry => ({
  id,
  component: 'src/X.tsx#X',
  status,
  props,
  rest,
})
const empreinte = (...entries: FingerprintEntry[]): Fingerprint => ({ version: 1, entries })
const changesOf = (avant: Fingerprint, après: Fingerprint) =>
  compareFingerprints(avant, après, FROM).changes
const tokenChangesOf = (avant: FingerprintToken[], après: FingerprintToken[]) =>
  compareFingerprints(
    { version: 1, entries: [], tokens: avant },
    { version: 1, entries: [], tokens: après },
    FROM,
  ).tokens

describe('the changes between two fingerprints', () => {
  test('names what appeared, changed and disappeared, in that order', () => {
    const avant = empreinte(
      entrée('a--garde', ['label']),
      entrée('a--props', ['label']),
      entrée('a--statut', [], 'draft'),
      entrée('a--partie', []),
    )
    const après = empreinte(
      entrée('a--neuve', ['tone']),
      entrée('a--garde', ['label']),
      entrée('a--props', ['label', 'tone']),
      entrée('a--statut', [], 'stable'),
    )

    expect(changesOf(avant, après)).toEqual([
      { kind: 'appeared', id: 'a--neuve' },
      { kind: 'changed', id: 'a--props', props: { before: ['label'], after: ['label', 'tone'] } },
      { kind: 'changed', id: 'a--statut', status: { before: 'draft', after: 'stable' } },
      { kind: 'disappeared', id: 'a--partie' },
    ])
  })

  test('names both halves when the props and the status moved together', () => {
    expect(
      changesOf(
        empreinte(entrée('a--x', ['a'], 'draft')),
        empreinte(entrée('a--x', ['b'], 'stable')),
      ),
    ).toEqual([
      {
        kind: 'changed',
        id: 'a--x',
        props: { before: ['a'], after: ['b'] },
        status: { before: 'draft', after: 'stable' },
      },
    ])
  })

  // Le condensé change avec la source ; le mode changements ne compare que les
  // identifiants, les statuts et les noms de props.
  test('does not list a story whose props and status stayed, whatever else moved', () => {
    expect(
      changesOf(
        empreinte(entrée('a--x', ['a'], 'none', 'avant')),
        empreinte(entrée('a--x', ['a'], 'none', 'après')),
      ),
    ).toEqual([])
  })

  test('tells a removed prop from an equal list of another length', () => {
    expect(
      changesOf(empreinte(entrée('a--x', ['a', 'b'])), empreinte(entrée('a--x', ['a']))),
    ).toEqual([{ kind: 'changed', id: 'a--x', props: { before: ['a', 'b'], after: ['a'] } }])
  })
})

describe('the changes of the tokens', () => {
  const jeton = (key: string, themes: Record<string, string>, family = 'tokens--color') => ({
    family,
    key,
    type: 'color',
    themes,
  })

  test('names what appeared, changed and disappeared, theme by theme', () => {
    expect(
      tokenChangesOf(
        [
          jeton('garde', { light: '#111' }),
          jeton('teinte', { light: '#111', dark: '#eee' }),
          jeton('partie', { light: '#000' }),
        ],
        [
          jeton('neuve', { light: '#fff' }),
          jeton('garde', { light: '#111' }),
          jeton('teinte', { light: '#111', dark: '#ddd' }),
        ],
      ),
    ).toEqual([
      { kind: 'appeared', family: 'tokens--color', key: 'neuve', after: { light: '#fff' } },
      {
        kind: 'changed',
        family: 'tokens--color',
        key: 'teinte',
        before: { light: '#111', dark: '#eee' },
        after: { light: '#111', dark: '#ddd' },
      },
      { kind: 'disappeared', family: 'tokens--color', key: 'partie', before: { light: '#000' } },
    ])
  })

  // Une même clé dans deux familles : deux tokens.
  test('keeps two families apart', () => {
    expect(
      tokenChangesOf(
        [jeton('base', { light: '#111' }, 'a')],
        [jeton('base', { light: '#111' }, 'b')],
      ),
    ).toEqual([
      { kind: 'appeared', family: 'b', key: 'base', after: { light: '#111' } },
      { kind: 'disappeared', family: 'a', key: 'base', before: { light: '#111' } },
    ])
  })
})

describe('the comparison', () => {
  test('says where it started from', () => {
    expect(compareFingerprints(empreinte(), empreinte(), FROM)).toEqual({
      from: FROM,
      changes: [],
      tokens: null,
    })
  })

  // Une empreinte d'avant les tokens ne dit rien d'eux : inconnus, pas vides.
  test('gives no token changes from a fingerprint that predates tokens', () => {
    const après = { ...empreinte(), tokens: [{ family: 'a', key: 'x', type: 'color', themes: {} }] }

    expect(compareFingerprints(empreinte(), après, FROM).tokens).toBeNull()
    expect(compareFingerprints({ ...empreinte(), tokens: [] }, après, FROM).tokens).toEqual([
      { kind: 'appeared', family: 'a', key: 'x', after: {} },
    ])
  })
})

describe('a fingerprint read from a file', () => {
  test('accepts one with entries, and tokens when it has them', () => {
    const lue = { version: 1, entries: [entrée('a--x', ['label'])], tokens: [] }

    expect(readFingerprint(lue)).toBe(lue)
  })

  test.for([
    [null, 'no `entries` list'],
    [
      { entries: [{ id: 'a' }] },
      'entry 0 lacks a string `id`, a string `status` or a `props` list',
    ],
    [{ entries: [], tokens: 'x' }, '`tokens` is not a list'],
    [
      { entries: [], tokens: [{ family: 'a', key: 'x', type: 'color', themes: { light: 1 } }] },
      'token 0 lacks a string `family`, `key` or `type`, or `themes` of strings',
    ],
  ] as const)('names what %j lacks', ([lue, manque]) => {
    expect(readFingerprint(lue)).toEqual({ lacks: manque })
  })
})
