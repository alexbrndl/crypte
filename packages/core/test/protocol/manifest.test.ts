import { describe, expect, it } from 'vitest'
import type { Manifest, PropDetails, StoryEntry } from '../../src/protocol/manifest'

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

  // Les valeurs `page` et `tokens` sont réservées mais non implémentées : le champ
  // existe pour éviter une migration, pas pour être utilisé aujourd'hui.
  //
  // L'entrée est complète et seul `type` varie. Une version antérieure partait de
  // `{ type: 'tokens', id: 'x' }' : les sept champs manquants suffisaient à
  // satisfaire le `@ts-expect-error`, si bien que le test passait sans jamais
  // vérifier ce qu'il annonçait, et aurait passé de même sur `type: string`.
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

describe('PropDetails', () => {
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

    const details = kinds.map(
      (type) => ({ name: 'prop', type, required: false }) satisfies PropDetails,
    )
    expect(details).toHaveLength(9)
  })

  // `control` ne vient pas du noyau : il est apporté par la simulation de plugin.
  it('accepte un champ apporté par un plugin installé', () => {
    const withPlugin = {
      name: 'onSelect',
      type: 'function',
      required: true,
      control: false,
    } satisfies PropDetails
    expect(withPlugin.control).toBe(false)
  })

  it('refuse une nature inconnue', () => {
    // @ts-expect-error `date` ne fait pas partie des neuf natures
    const invalid = { name: 'createdAt', type: 'date', required: false } satisfies PropDetails
    expect(invalid).toBeDefined()
  })
})
