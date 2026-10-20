import type { StoryEntry, TokensEntry } from '@crypte/core/protocol'
import { describe, expect, test } from 'vitest'
import { findingsOf, type Finding } from '../src/health/audit'
import { colorOf, suspectsOf } from '../src/health/suspects'
import { categoriesOf } from '../src/tokens/categories'

// Les tokens probablement en cause d'un défaut de contraste, rapprochés par la
// valeur des couleurs qu'axe a mesurées.

const families: TokensEntry[] = [
  {
    type: 'tokens',
    id: 'tokens--gris',
    path: ['Tokens'],
    name: 'gris',
    tokens: {
      '500': { type: 'color', themes: { default: { value: '#777' } } },
      '100': { type: 'color', themes: { default: { value: '#EEEEEE' } } },
    },
  },
  {
    type: 'tokens',
    id: 'tokens--texte',
    path: ['Tokens'],
    name: 'texte',
    tokens: {
      doux: {
        type: 'color',
        themes: {
          light: { value: '#777777', alias: ['gris-500'] },
          dark: { value: 'rgb(238, 238, 238)', alias: ['gris-100'] },
        },
      },
    },
  },
]

const lit = (id: string, file: string, tokens: string[]) =>
  ({
    type: 'story',
    id,
    path: [file],
    name: 'x',
    component: { file, export: file, tokens },
  }) as StoryEntry

const stories = [
  lit('a--x', 'src/A.tsx', ['texte-doux']),
  lit('a--y', 'src/A.tsx', ['texte-doux']),
  lit('b--x', 'src/B.tsx', ['texte-doux', 'gris-500']),
]

const violation = (colors: string[] | undefined, themes: Finding['themes']): Finding => ({
  key: 'a--x:color-contrast',
  id: 'a--x',
  violation: {
    rule: 'color-contrast',
    impact: 'serious',
    help: 'contraste',
    helpUrl: 'u',
    targets: ['.a'],
  },
  themes,
  colors: colors ? Object.fromEntries(themes.map((theme) => [theme, colors])) : {},
})

describe('the tokens probably behind a contrast violation', () => {
  // Ceux dont la valeur dans le thème de la violation est mesurée, les plus lus
  // d'abord, le nombre de composants et non de stories.
  test('match the measured colours in the themes of the violation, the most read first', () => {
    const found = suspectsOf(
      violation(['#777777', '#ffffff'], ['light']),
      categoriesOf(families),
      stories,
    )
    expect(found.map((one) => [one.token.name, one.readers])).toEqual([
      ['texte-doux', 2],
      ['gris-500', 1],
    ])
  })

  // En dark, le texte doux vaut un gris clair écrit en rgb() : seul ce thème le
  // rapproche de la couleur mesurée.
  test('read the value of each theme, written in rgb() or short hex', () => {
    const categories = categoriesOf(families)
    expect(
      suspectsOf(violation(['#eeeeee'], ['dark']), categories, stories).map(
        (one) => one.token.name,
      ),
    ).toEqual(['texte-doux', 'gris-100'])
    expect(
      suspectsOf(violation(['#eeeeee'], ['light']), categories, stories).map(
        (one) => one.token.name,
      ),
    ).toEqual(['gris-100'])
  })

  // Une violation des deux thèmes, mesurée autrement dans chacun : chaque thème
  // se compare à ses propres couleurs.
  test('compare each theme with the colours measured in it', () => {
    const contraste = (theme: 'light' | 'dark', colors: string[]) => ({
      id: 'a--x',
      theme,
      passes: 0,
      violations: [
        {
          rule: 'color-contrast',
          impact: 'serious' as const,
          help: 'c',
          helpUrl: 'u',
          targets: ['.a'],
          colors,
        },
      ],
    })
    const [finding] = findingsOf([
      contraste('light', ['#777777', '#eeeeee']),
      contraste('dark', ['#123456']),
    ])
    expect(finding!.themes).toEqual(['light', 'dark'])
    expect(
      suspectsOf(finding!, categoriesOf(families), stories).map((one) => one.token.name),
    ).toEqual(['texte-doux', 'gris-500', 'gris-100'])
    // Le texte doux vaut #777777 en light, ce que seul le dark a mesuré : il
    // n'est pas en cause.
    const [sombre] = findingsOf([contraste('light', ['#123456']), contraste('dark', ['#777777'])])
    expect(
      suspectsOf(sombre!, categoriesOf(families), stories).map((one) => one.token.name),
    ).toEqual(['gris-500'])
  })

  test('name nobody without measured colours', () => {
    expect(suspectsOf(violation(undefined, ['light']), categoriesOf(families), stories)).toEqual([])
  })
})

describe('a colour made comparable', () => {
  test('writes six lowercase hex digits, drops an opaque alpha, converts rgb()', () => {
    expect(
      [
        '#ABC',
        '#AABBCCFF',
        '#aabbcc80',
        'rgb(0, 128, 255)',
        'rgba(0,128,255,1)',
        'rgb(0 128 255 / 0.5)',
        'oklch(0.5 0.1 200)',
      ].map(colorOf),
    ).toEqual([
      '#aabbcc',
      '#aabbcc',
      '#aabbcc80',
      '#0080ff',
      '#0080ff',
      'rgb(0 128 255 / 0.5)',
      'oklch(0.5 0.1 200)',
    ])
  })
})
