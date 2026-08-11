import { describe, expect, it } from 'vitest'
import type { ArgType, Manifest, StoryEntry } from '../../src/protocol/manifest'

// L'entrée reproduite dans docs/spec-contrats.md §4.2, qui doit être acceptée
// telle quelle : c'est le contrat entre le CLI qui l'écrit et le shell qui la lit.
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
          argTypes: {},
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
      argTypes: {},
      source: '<Badge />',
    } satisfies StoryEntry

    expect('meta' in entry).toBe(false)
  })

  // Les valeurs `page` et `tokens` sont réservées mais non implémentées : le champ
  // existe pour éviter une migration, pas pour être utilisé aujourd'hui.
  it("refuse un type d'entrée non implémenté", () => {
    // @ts-expect-error seule la valeur `story` est implémentée en v1
    const reserved = { type: 'tokens', id: 'x' } satisfies StoryEntry
    expect(reserved).toBeDefined()
  })
})

describe('ArgType', () => {
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

    const argTypes = kinds.map(
      (type) => ({ name: 'prop', type, required: false }) satisfies ArgType,
    )
    expect(argTypes).toHaveLength(9)
  })

  it('accepte control à false, qui retire la prop du panneau sans la masquer', () => {
    const argType = {
      name: 'onSelect',
      type: 'function',
      required: true,
      control: false,
    } satisfies ArgType
    expect(argType.control).toBe(false)
  })

  it('refuse une nature inconnue', () => {
    // @ts-expect-error `date` ne fait pas partie des neuf natures
    const invalid = { name: 'createdAt', type: 'date', required: false } satisfies ArgType
    expect(invalid).toBeDefined()
  })
})
