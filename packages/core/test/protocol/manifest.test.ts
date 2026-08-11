import { describe, expect, it } from 'vitest'
import type { Manifest, StoryEntry } from '../../src/protocol/manifest'
import type { ResolvedPropDetails } from '../../src/protocol/prop'

// L'entrée de docs/spec-contrats.md §4.2, acceptée telle quelle.
describe('Manifest', () => {
  it("accepte l'exemple de la spécification", () => {
    const manifest = {
      version: 1,
      entries: [
        {
          type: 'story',
          id: 'checkout/ordersummary--avec-reference',
          path: ['checkout', 'OrderSummary'],
          name: 'Avec référence',
          component: {
            name: 'OrderSummary',
            file: 'src/components/checkout/OrderSummary.tsx',
            export: 'default',
          },
          storyFile: 'stories/checkout/OrderSummary.ts',
          options: {},
          details: {},
          source: '<OrderSummary reference="REF-4821…" />',
          meta: { status: 'stable' },
        },
      ],
    } satisfies Manifest

    expect(manifest.entries[0]?.id).toBe('checkout/ordersummary--avec-reference')
  })

  it('rend meta facultatif', () => {
    const entry = {
      type: 'story',
      id: 'badge--par-defaut',
      path: ['Badge'],
      name: 'Par défaut',
      component: { name: 'Badge', file: 'src/Badge.tsx', export: 'default' },
      storyFile: 'stories/Badge.ts',
      options: {},
      details: {},
      source: '<Badge />',
    } satisfies StoryEntry

    expect('meta' in entry).toBe(false)
  })

  // Entrée complète, seul `type` varie : avec des champs manquants, la directive
  // serait satisfaite par eux et le test passerait aussi sur `type: string`.
  it("refuse un type d'entrée non implémenté", () => {
    const reserved = {
      // @ts-expect-error seule la valeur `story` est implémentée en v1
      type: 'tokens',
      id: 'badge--par-defaut',
      path: ['Badge'],
      name: 'Par défaut',
      component: { name: 'Badge', file: 'src/Badge.tsx', export: 'default' },
      storyFile: 'stories/Badge.ts',
      options: {},
      details: {},
      source: '<Badge />',
    } satisfies StoryEntry
    expect(reserved).toBeDefined()
  })
})

describe('ResolvedPropDetails', () => {
  it('accepte les neuf natures de la spécification', () => {
    const kinds = [
      'string',
      'number',
      'boolean',
      'enum',
      'object',
      'array',
      'function',
      'node',
      'unknown',
    ] as const

    const details = kinds.map((type) => ({ type, required: false }) satisfies ResolvedPropDetails)
    expect(details).toHaveLength(9)
  })

  // `control` vient de la simulation de plugin, pas du noyau.
  it('accepte un champ apporté par un plugin installé', () => {
    const withPlugin = {
      type: 'function',
      required: true,
      control: false,
    } satisfies ResolvedPropDetails
    expect(withPlugin.control).toBe(false)
  })

  it('refuse une nature inconnue', () => {
    // @ts-expect-error `date` ne fait pas partie des neuf natures
    const invalid = { type: 'date', required: false } satisfies ResolvedPropDetails
    expect(invalid).toBeDefined()
  })
})
