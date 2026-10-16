import { describe, expect, test } from 'vitest'
import { ago } from '../src/navigation/recent'

// L'ancienneté d'un récent, à chaque borne.

describe('the age of a recent place', () => {
  const minute = 60_000
  const at = (minutes: number) => ago(0, minutes * minute)

  test('reads minutes, then hours, then days', () => {
    expect([0.5, 1, 59, 60, 23 * 60 + 59, 24 * 60, 48 * 60 - 1, 48 * 60].map(at)).toEqual([
      'just now',
      '1 min ago',
      '59 min ago',
      '1 h ago',
      '23 h ago',
      'yesterday',
      'yesterday',
      '2 days ago',
    ])
  })
})
