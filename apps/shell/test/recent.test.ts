import { describe, expect, test } from 'vitest'
import { ago } from '../src/navigation/recent'

// L'ancienneté d'un récent, à chaque borne.

describe('the age of a recent place', () => {
  const minute = 60_000
  const at = (minutes: number) => ago(0, minutes * minute)

  test('reads minutes, then hours, days, weeks and months', () => {
    const jour = 24 * 60
    expect(
      [
        0.5,
        1,
        59,
        60,
        23 * 60 + 59,
        jour,
        2 * jour - 1,
        2 * jour,
        7 * jour - 1,
        7 * jour,
        14 * jour,
        30 * jour,
        60 * jour,
      ].map(at),
    ).toEqual([
      'just now',
      '1 min ago',
      '59 min ago',
      '1 h ago',
      '23 h ago',
      'yesterday',
      'yesterday',
      '2 days ago',
      '6 days ago',
      'last week',
      '2 weeks ago',
      'last month',
      '2 months ago',
    ])
  })
})
