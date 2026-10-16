import type { TokenValue } from '@crypte/core/protocol'
import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import type { Category } from '../src/tokens/categories'
import TokensView from '../src/tokens/tokens-view.vue'

// Chaque disposition de la vue tokens : ce qu'elle tire de la valeur d'un token.

const token = (family: string, key: string, value: string, type: TokenValue['type']) => ({
  name: `${family}-${key}`,
  key: `tokens--${family}/${key}`,
  family,
  value: { type, themes: { default: { value } } },
})
const category = (name: string, tokens: ReturnType<typeof token>[]): Category => ({
  name,
  groups: [{ id: `tokens--${name}`, family: tokens[0]!.family, tokens }],
  count: tokens.length,
})
const monte = (shown: Category) =>
  mount(TokensView, {
    props: {
      category: shown,
      theme: 'light',
      selected: null,
      hrefOf: (name: string) => `?t=${name}`,
    },
  })
const styles = (wrapper: ReturnType<typeof monte>, selector: string) =>
  wrapper.findAll(selector).map((one) => (one.element as HTMLElement).style)

describe('the layouts of the tokens view', () => {
  // À l'échelle 1:1, un rem à 16 px, coupée à la piste de 480, rien pour ce qui ne
  // se lit pas comme une longueur.
  test('draws a space as a bar of its width, cut at the track', () => {
    const wrapper = monte(
      category('space', [
        token('space', 'a', '1px', 'dimension'),
        token('space', 'b', '1.5rem', 'dimension'),
        token('space', 'c', '900px', 'dimension'),
        token('space', 'd', '2px 10px', 'unknown'),
      ]),
    )

    expect(wrapper.attributes('data-layout')).toBe('space')
    expect(styles(wrapper, '.bar').map((one) => one.width)).toEqual(['1px', '24px', '480px', '0px'])
  })

  test('styles a type specimen by the family of its token', () => {
    const wrapper = monte({
      name: 'typography',
      groups: [
        { id: 't', family: 'text', tokens: [token('text', 'base', '16px', 'dimension')] },
        { id: 'l', family: 'leading', tokens: [token('leading', 'base', '24px', 'dimension')] },
        { id: 'w', family: 'weight', tokens: [token('weight', 'bold', '700', 'number')] },
        {
          id: 'k',
          family: 'tracking',
          tokens: [token('tracking', 'tight', '-0.025em', 'dimension')],
        },
        { id: 'f', family: 'font', tokens: [token('font', 'mono', 'monospace', 'unknown')] },
        { id: 'o', family: 'other', tokens: [token('other', 'x', '1', 'number')] },
      ],
      count: 6,
    })
    const [size, leading, weight, tracking, font, other] = styles(wrapper, '.specimen')

    expect(size!.fontSize).toBe('16px')
    expect(leading!.lineHeight).toBe('24px')
    expect(weight!.fontWeight).toBe('700')
    expect(tracking!.letterSpacing).toBe('-0.025em')
    expect(font!.fontFamily).toBe('monospace')
    expect(other!.cssText).toBe('')
  })

  test('draws a radius and a stroke on their tile', () => {
    expect(
      styles(monte(category('radius', [token('radius', 'md', '6px', 'dimension')])), '.shape')[0]!
        .borderRadius,
    ).toBe('6px')
    expect(
      styles(
        monte(category('stroke', [token('stroke', 'focus', '1.5px', 'dimension')])),
        '.shape',
      )[0]!.borderWidth,
    ).toBe('1.5px')
  })

  test('lists any other category, with no swatch, bar or tile', () => {
    const wrapper = monte(category('size', [token('size', 'icon', '16px', 'dimension')]))

    expect(wrapper.attributes('data-layout')).toBe('list')
    expect(wrapper.findAll('.swatch, .bar, .shape, .specimen')).toHaveLength(0)
    expect([wrapper.find('.name').text(), wrapper.find('.value').text()]).toEqual([
      'size-icon',
      '16px',
    ])
  })
})
