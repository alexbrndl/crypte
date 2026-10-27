import { describe, expect, test } from 'vitest'
import { gaugesOf, problemsOf, rowsOf, scoreOf, type HealthComponent } from '../src/health/health'

// Le score et les pages de la vue santé, tirés des composants.

const un = (name: string, more: Partial<HealthComponent> = {}): HealthComponent => ({
  name,
  file: `src/${name}.tsx`,
  export: name,
  stories: [],
  props: 0,
  required: 0,
  ...more,
})

describe('the score', () => {
  test('is the mean of the gauges that measure something, rounded', () => {
    expect(scoreOf([{ label: 'stories', done: 1, total: 3 }])).toBe(33)
    expect(
      scoreOf([
        { label: 'stories', done: 1, total: 2 },
        { label: 'a11y', done: 0, total: 0 },
      ]),
    ).toBe(50)
  })

  // Rien à compter : aucune jauge ne dit rien, le score est nul plutôt que NaN.
  test('is zero with nothing to count', () => {
    expect(scoreOf([])).toBe(0)
    expect(scoreOf(gaugesOf([]))).toBe(0)
  })
})

describe('the pages', () => {
  test('keep only the components without a story, the most props first', () => {
    const rows = rowsOf('unstoried', [
      un('A', { props: 1 }),
      un('B', { props: 4 }),
      un('C', { stories: ['c--x'], props: 9 }),
    ])
    expect(rows.map((one) => one.name)).toEqual(['B', 'A'])
  })

  // Un composant stable ou sans statut n'a rien à suivre.
  test('keep only draft and deprecated statuses, deprecated first, the most imported first', () => {
    const rows = rowsOf('statuses', [
      un('A', { status: 'draft' }),
      un('B', { status: 'stable' }),
      un('C', { status: 'deprecated', stories: ['c--x', 'c--y'] }),
      un('D'),
      un('E', { status: 'deprecated', usedBy: ['src/F.tsx:F'] }),
    ])
    expect(rows.map((one) => one.name)).toEqual(['E', 'C', 'A'])
  })
})

// Ce qu'une story n'exerce pas, puis ce que l'application n'importe pas.
describe('the coverage page', () => {
  test('keeps the components with props never exercised or no use, the most missing first', () => {
    const rows = rowsOf('coverage', [
      un('A', { unexercised: ['x'], usedIn: ['src/p.tsx'] }),
      un('B', { usedIn: ['src/p.tsx'] }),
      un('C', { unexercised: ['x', 'y'], usedIn: ['src/p.tsx'] }),
      un('D'),
      un('E', { unexercised: ['x'], usedIn: ['src/p.tsx', 'src/q.tsx'] }),
      un('F', { unexercised: ['x'] }),
    ])
    expect(rows.map((one) => one.name)).toEqual(['C', 'F', 'A', 'E', 'D'])
  })
})

// Un composant déprécié documenté par ses stories n'a rien à faire ; il en a
// tant qu'un autre composant l'importe.
describe('the problems of a component', () => {
  test('count a deprecated one only while another imports it', () => {
    expect(problemsOf(un('A', { status: 'deprecated', stories: ['a--x'] }))).toBe(0)
    expect(
      problemsOf(un('A', { status: 'deprecated', stories: ['a--x'], usedBy: ['src/B.tsx:B'] })),
    ).toBe(1)
    expect(problemsOf(un('A', { usedBy: ['src/B.tsx:B'], stories: ['a--x'] }))).toBe(0)
  })
})
