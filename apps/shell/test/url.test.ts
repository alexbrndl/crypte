import { describe, expect, test } from 'vitest'
import { placeSearch, readPlace, type Place } from '../src/navigation/url'

// Les adresses que le shell lit et écrit. Elles finissent dans des liens collés
// ailleurs : un nom qui change casse tous ceux qui existent déjà.

describe('reading an address', () => {
  test.each<[string, Place]>([
    ['', { mode: 'home' }],
    ['?id=badge--defaut', { mode: 'entry', id: 'badge--defaut' }],
    [
      '?id=checkout/ordersummary--with-reference',
      { mode: 'entry', id: 'checkout/ordersummary--with-reference' },
    ],
    ['?id=checkout%2Fordersummary--x', { mode: 'entry', id: 'checkout/ordersummary--x' }],
    ['?component=checkout/ordersummary', { mode: 'component', id: 'checkout/ordersummary' }],
    ['?changes', { mode: 'changes' }],
    ['?changes=', { mode: 'changes' }],
    [
      '?changes&from=v1.0.0&change=story:badge--x',
      { mode: 'changes', from: 'v1.0.0', change: 'story:badge--x' },
    ],
    ['?changes&before=2026-09-16&from=', { mode: 'changes', before: '2026-09-16' }],
    ['?tokens=color', { mode: 'tokens', category: 'color' }],
    [
      '?tokens=color&token=accent-base',
      { mode: 'tokens', category: 'color', token: 'accent-base' },
    ],
    // Un token vide ne nomme rien : la catégorie seule reste.
    ['?tokens=color&token=', { mode: 'tokens', category: 'color' }],
    ['?health=overview', { mode: 'health', page: 'overview' }],
    [
      '?health=statuses&item=src/components/Badge.tsx:Badge',
      { mode: 'health', page: 'statuses', item: 'src/components/Badge.tsx:Badge' },
    ],
    ['?health=overview&item=', { mode: 'health', page: 'overview' }],
    ['?view=i18n', { mode: 'view', plugin: 'i18n' }],
    ['?view=i18n&item=fr', { mode: 'view', plugin: 'i18n', item: 'fr' }],
    ['?view=i18n&item=', { mode: 'view', plugin: 'i18n' }],
  ])('reads %j', (search, place) => {
    expect(readPlace(search)).toEqual(place)
  })

  // Rien d'autre ne nomme un endroit : une valeur vide, un nom qui n'est pas le
  // nôtre, une autre casse, les lettres seules qu'une première version proposait.
  test.each([
    '?id=',
    '?component=',
    '?tokens=',
    '?health=',
    '?view=',
    '?item=src/components/Badge.tsx:Badge',
    '?token=accent-base',
    '?story=badge--defaut',
    '?ID=badge--defaut',
    '?s=badge--defaut',
    '?c=badge',
    '#badge--defaut',
  ])('reads %j as no place', (search) => {
    expect(readPlace(search)).toEqual({ mode: 'home' })
  })

  test('reads one mode per address, the entry first, then the component', () => {
    expect(readPlace('?changes&component=badge&id=badge--defaut')).toEqual({
      mode: 'entry',
      id: 'badge--defaut',
    })
    expect(readPlace('?changes&component=badge')).toEqual({ mode: 'component', id: 'badge' })
    expect(readPlace('?id=&component=badge')).toEqual({ mode: 'component', id: 'badge' })
    expect(readPlace('?changes&tokens=color')).toEqual({ mode: 'tokens', category: 'color' })
    expect(readPlace('?tokens=color&component=badge')).toEqual({ mode: 'component', id: 'badge' })
  })

  test('ignores what someone else adds to the address', () => {
    expect(readPlace('?utm_source=slack&id=badge--defaut')).toEqual({
      mode: 'entry',
      id: 'badge--defaut',
    })
  })
})

describe('writing an address', () => {
  test.each<[Place, string]>([
    [{ mode: 'home' }, ''],
    [
      { mode: 'entry', id: 'checkout/ordersummary--with-reference' },
      '?id=checkout/ordersummary--with-reference',
    ],
    [{ mode: 'component', id: 'checkout/ordersummary' }, '?component=checkout/ordersummary'],
    [{ mode: 'changes' }, '?changes'],
    [
      { mode: 'changes', from: 'main', change: 'token:tokens--color/text' },
      '?changes&from=main&change=token:tokens--color/text',
    ],
    [{ mode: 'tokens', category: 'color' }, '?tokens=color'],
    [
      { mode: 'tokens', category: 'color', token: 'accent-base' },
      '?tokens=color&token=accent-base',
    ],
    // Un identifiant n'est pas ASCII (§4.3), et une famille de tokens porte
    // l'identifiant que son plugin lui donne : ce qui couperait la requête
    // s'encode.
    [
      { mode: 'entry', id: 'button--активная' },
      '?id=button--%D0%B0%D0%BA%D1%82%D0%B8%D0%B2%D0%BD%D0%B0%D1%8F',
    ],
    [{ mode: 'entry', id: 'a&b=c#d e+f' }, '?id=a%26b%3Dc%23d%20e%2Bf'],
    [{ mode: 'health', page: 'overview' }, '?health=overview'],
    [
      { mode: 'health', page: 'unstoried', item: 'src/components/form/Select.tsx:default' },
      '?health=unstoried&item=src/components/form/Select.tsx:default',
    ],
    [{ mode: 'view', plugin: 'i18n' }, '?view=i18n'],
    [{ mode: 'view', plugin: 'i18n', item: 'fr' }, '?view=i18n&item=fr'],
  ])('writes %j', (place, search) => {
    expect(placeSearch(place)).toBe(search)
  })

  test('reads back what it writes', () => {
    const places: Place[] = [
      { mode: 'home' },
      { mode: 'entry', id: 'checkout/ordersummary--with-reference' },
      { mode: 'entry', id: 'button--активная' },
      { mode: 'entry', id: 'a&b=c#d e+f' },
      { mode: 'component', id: 'checkout/ordersummary' },
      { mode: 'changes' },
      { mode: 'changes', from: 'a&b', before: '2026-01-01', change: 'story:x y' },
      { mode: 'tokens', category: 'color' },
      { mode: 'tokens', category: 'a&b', token: 'c#d e' },
      { mode: 'view', plugin: 'a&b', item: 'c#d e' },
    ]

    for (const place of places) expect(readPlace(placeSearch(place))).toEqual(place)
  })
})
