import type { PageEntry } from '@crypte/core/protocol'
import { describe, expect, test } from 'vitest'
import { cites, citing } from '../src/pages/links'

// Une page cite un composant quand son texte porte son nom en mot entier.

const page = (id: string, body: string): PageEntry => ({
  type: 'page',
  id,
  path: [],
  name: id,
  file: `stories/${id}.md`,
  body,
})

describe('what a page cites', () => {
  test('finds a name as a whole word, case included', () => {
    expect(cites('Prefer a Badge.', 'Badge')).toBe(true)
    expect(cites('Badge', 'Badge')).toBe(true)
    expect(cites('`<Badge />`', 'Badge')).toBe(true)
    expect(cites('Use Badges here.', 'Badge')).toBe(false)
    expect(cites('A badge.', 'Badge')).toBe(false)
    expect(cites('MyBadge', 'Badge')).toBe(false)
    expect(cites('Badge_x', 'Badge')).toBe(false)
    expect(cites('Écran', 'cran')).toBe(false)
  })

  test('reads a name as text, never as a pattern', () => {
    expect(cites('Use $Price.', '$Price')).toBe(true)
    expect(cites('Use xPrice.', '.Price')).toBe(false)
    expect(cites('anything', '')).toBe(false)
  })

  test('leaves out the page of the component itself', () => {
    const own = page('badge', 'Badge is short.')
    const other = page('guide', 'See Badge.')
    expect(citing([own, other, page('x', 'Nothing.')], 'Badge', own)).toEqual([other])
  })
})
