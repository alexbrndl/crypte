import type { TokensEntry, TokenValue } from '@crypte/core/protocol'
import { describe, expect, test } from 'vitest'
import { categoriesOf, valueIn } from '../src/tokens/categories'

// Les catégories de la vue tokens, calculées dans le shell à partir des familles
// que le plugin rend.

const literal = (value: string, type: TokenValue['type'] = 'color'): TokenValue => ({
  type,
  themes: { default: { value } },
})
const aliased = (value: string, to: string): TokenValue => ({
  type: 'color',
  themes: { light: { value, alias: [to] }, dark: { value, alias: [to] } },
})
const family = (name: string, tokens: Record<string, TokenValue>): TokensEntry => ({
  type: 'tokens',
  id: `tokens--${name}`,
  path: ['Tokens'],
  name,
  tokens,
})

const shape = (families: TokensEntry[]) =>
  categoriesOf(families).map((one) => ({
    name: one.name,
    count: one.count,
    groups: one.groups.map(
      (group) => `${group.family}: ${group.tokens.map((t) => t.name).join(' ')}`,
    ),
  }))

describe('the categories of the tokens view', () => {
  test('puts a colour family with an alias in color, and one with none in palette', () => {
    expect(
      shape([
        family('stone', { '50': literal('#fafaf9'), '900': literal('#1c1917') }),
        family('accent', { base: aliased('#00776e', 'teal-700'), hover: literal('#005f58') }),
      ]),
    ).toEqual([
      { name: 'color', count: 2, groups: ['accent: accent-base accent-hover'] },
      { name: 'palette', count: 2, groups: ['stone: stone-50 stone-900'] },
    ])
  })

  // `text` mêle couleurs et tailles : les couleurs vont dans color, les tailles
  // dans typography, avec leading, weight, tracking et font.
  test('gathers the type families in typography, and splits text by kind', () => {
    expect(
      shape([
        family('text', {
          primary: aliased('#1c1917', 'stone-900'),
          base: literal('16px', 'dimension'),
        }),
        family('leading', { base: literal('24px', 'dimension') }),
        family('weight', { bold: literal('700', 'number') }),
        family('tracking', { tight: literal('-0.025em', 'dimension') }),
        family('font', { sans: literal('Geist', 'unknown') }),
      ]),
    ).toEqual([
      { name: 'color', count: 1, groups: ['text: text-primary'] },
      {
        name: 'typography',
        count: 5,
        groups: [
          'text: text-base',
          'leading: leading-base',
          'weight: weight-bold',
          'tracking: tracking-tight',
          'font: font-sans',
        ],
      },
    ])
  })

  test('orders as the Figma sidebar, then the palette, then the rest by name', () => {
    expect(
      categoriesOf([
        family('zeta', { a: literal('1', 'number') }),
        family('size', { icon: literal('16px', 'dimension') }),
        family('stroke', { hairline: literal('1px', 'dimension') }),
        family('base', { white: literal('#fff') }),
        family('radius', { sm: literal('4px', 'dimension') }),
        family('alpha', { a: literal('1', 'number') }),
        family('space', { '1': literal('4px', 'dimension') }),
        family('border', { base: aliased('#d6d3d1', 'stone-300') }),
      ]).map((one) => one.name),
    ).toEqual(['color', 'space', 'radius', 'stroke', 'size', 'palette', 'alpha', 'zeta'])
  })

  // `--radius` donne la famille et la clé `radius` : le nom reste celui écrit.
  test('keeps the name of a lone property', () => {
    expect(shape([family('radius', { radius: literal('4px', 'dimension') })])).toEqual([
      { name: 'radius', count: 1, groups: ['radius: radius'] },
    ])
  })

  // Une échelle dans l'ordre de ses valeurs : le plugin trie par nom.
  test('orders a scale by value when every value shares a unit, by name otherwise', () => {
    const names = (families: TokensEntry[]) =>
      categoriesOf(families).flatMap((one) =>
        one.groups.flatMap((g) => g.tokens.map((t) => t.name)),
      )

    expect(
      names([
        family('space', {
          '0': literal('0', 'dimension'),
          '0-25': literal('1px', 'dimension'),
          '12': literal('48px', 'dimension'),
          '4': literal('16px', 'dimension'),
        }),
      ]),
    ).toEqual(['space-0', 'space-0-25', 'space-4', 'space-12'])
    expect(
      names([family('space', { b: literal('1rem', 'dimension'), a: literal('4px', 'dimension') })]),
    ).toEqual(['space-b', 'space-a'])
    expect(
      names([family('gap', { b: literal('2px 4px', 'unknown'), a: literal('1px', 'dimension') })]),
    ).toEqual(['gap-b', 'gap-a'])
  })

  test('orders the type groups as the Figma page: size, leading, weight, tracking, family', () => {
    expect(
      categoriesOf([
        family('font', { sans: literal('Geist', 'unknown') }),
        family('leading', { base: literal('24px', 'dimension') }),
        family('text', { base: literal('16px', 'dimension') }),
        family('tracking', { tight: literal('-0.025em', 'dimension') }),
        family('weight', { bold: literal('700', 'number') }),
      ])[0]!.groups.map((group) => group.family),
    ).toEqual(['text', 'leading', 'weight', 'tracking', 'font'])
  })

  test('has no category without a family', () => {
    expect(categoriesOf([])).toEqual([])
  })
})

describe('the value in the theme on display', () => {
  const both: TokenValue = {
    type: 'color',
    themes: { default: { value: '#fff' }, dark: { value: '#000' } },
  }

  test('takes the theme, then default, and invents nothing for a theme the source omits', () => {
    expect(valueIn(both, 'dark')).toBe('#000')
    expect(valueIn(both, 'light')).toBe('#fff')
    expect(
      valueIn({ type: 'dimension', themes: { dark: { value: '4px' } } }, 'light'),
    ).toBeUndefined()
  })
})
