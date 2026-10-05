import { describe, expect, test } from 'vitest'
import { placeSearch, readPlace, type Place } from '../src/url'

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
  ])('reads %j', (search, place) => {
    expect(readPlace(search)).toEqual(place)
  })

  // Rien d'autre ne nomme un endroit : une valeur vide, un nom qui n'est pas le
  // nôtre, une autre casse, les lettres seules qu'une première version proposait.
  test.each([
    '?id=',
    '?component=',
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
    // Un identifiant n'est pas ASCII (§4.3), et une famille de tokens porte
    // l'identifiant que son plugin lui donne : ce qui couperait la requête
    // s'encode.
    [
      { mode: 'entry', id: 'button--активная' },
      '?id=button--%D0%B0%D0%BA%D1%82%D0%B8%D0%B2%D0%BD%D0%B0%D1%8F',
    ],
    [{ mode: 'entry', id: 'a&b=c#d e+f' }, '?id=a%26b%3Dc%23d%20e%2Bf'],
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
    ]

    for (const place of places) expect(readPlace(placeSearch(place))).toEqual(place)
  })
})
