import { describe, expect, it } from 'vitest'
import type { Manifest, ManifestEntry, StoryEntry, TokensEntry } from '../../src/protocol/manifest'
import type { ResolvedPropDetails } from '../../src/protocol/prop'
import type { TokenValue } from '../../src/protocol/tokens'

// L'entrée de docs/contracts.md §4.2, acceptée telle quelle.
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
          props: ['benefits', 'reference', 'title'],
          source: '<OrderSummary reference="REF-4821…" />',
          meta: { status: 'stable' },
        },
        {
          type: 'tokens',
          id: 'color--brand',
          path: ['Color'],
          name: 'Brand',
          tokens: { primary: { type: 'color', themes: { light: { value: '#4fe0a0' } } } },
        },
      ],
    } satisfies Manifest

    // Les deux natures dans la même liste : sans la seconde, ajouter une nature
    // au protocole sans la brancher dans `ManifestEntry` passerait au vert.
    expect(manifest.entries.map((entry) => entry.type)).toEqual(['story', 'tokens'])
  })

  // `version` n'est pas lié à `MANIFEST_VERSION` : le champ sert à reconnaître un
  // manifeste écrit par une autre version, ce qu'un type figé rendrait impossible.
  it('accepte une version autre que la version courante', () => {
    const older = { version: 2, entries: [] } satisfies Manifest
    expect(older.version).toBe(2)
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
      props: [],
      source: '<Badge />',
    } satisfies StoryEntry

    expect('meta' in entry).toBe(false)
  })

  // Entrée complète, seul `type` varie : avec des champs manquants, la directive
  // serait satisfaite par eux et le test passerait aussi sur `type: string`.
  // Ce que ça garde depuis que `tokens` existe : `StoryEntry.type` reste le
  // littéral `story`, donc une entrée d'une autre nature ne peut pas s'y glisser.
  it("refuse une autre nature d'entrée sous le type d'une story", () => {
    const reserved = {
      // @ts-expect-error `StoryEntry.type` ne vaut que `story`
      type: 'tokens',
      id: 'badge--par-defaut',
      path: ['Badge'],
      name: 'Par défaut',
      component: { name: 'Badge', file: 'src/Badge.tsx', export: 'default' },
      storyFile: 'stories/Badge.ts',
      options: {},
      details: {},
      props: [],
      source: '<Badge />',
    } satisfies StoryEntry
    expect(reserved).toBeDefined()
  })

  // Entrée tokens complète, seul `type` varie : avec des champs manquants, la
  // directive serait satisfaite par eux, et le cas passerait aussi sur une union
  // qui accepte `page`. Mesuré sur la première version de ce test.
  it('refuse une nature qui n’existe pas', () => {
    const unimplemented = {
      // @ts-expect-error `page` est réservé et n'est pas implémenté
      type: 'page',
      id: 'color--brand',
      path: ['Color'],
      name: 'Brand',
      tokens: {},
    } satisfies ManifestEntry
    expect(unimplemented).toBeDefined()
  })
})

// L'entrée tokens de docs/contracts.md §4.2.
describe('TokensEntry', () => {
  it("accepte l'exemple de la spécification", () => {
    const entry = {
      type: 'tokens',
      id: 'color--brand',
      path: ['Color'],
      name: 'Brand',
      tokens: {
        primary: {
          type: 'color',
          themes: { light: { value: '#4fe0a0' }, dark: { value: '#1f5fd6' } },
        },
        'button-background': {
          type: 'color',
          description: 'Filled buttons only.',
          themes: {
            light: { value: '#4fe0a0', alias: ['color-brand-primary'] },
            dark: { value: '#1f5fd6', alias: ['color-brand-primary'] },
          },
        },
      },
    } satisfies TokensEntry

    expect(Object.keys(entry.tokens)).toEqual(['primary', 'button-background'])
  })

  // Le champ qui porte les options d'un plugin vient du fichier de story, et
  // personne n'écrit une entrée tokens à la main.
  it("refuse les champs qu'une story seule porte", () => {
    const entry = {
      type: 'tokens',
      id: 'color--brand',
      path: ['Color'],
      name: 'Brand',
      tokens: {},
      // @ts-expect-error une entrée tokens ne porte ni `options` ni `storyFile`
      options: {},
    } satisfies TokensEntry
    expect(entry).toBeDefined()
  })
})

describe('TokenValue', () => {
  it('rend description et alias facultatifs', () => {
    const bare = { type: 'dimension', themes: { light: { value: '4px' } } } satisfies TokenValue

    expect('description' in bare).toBe(false)
    expect('alias' in (bare.themes.light ?? {})).toBe(false)
  })

  it('accepte les six natures de la spécification', () => {
    const kinds = ['color', 'dimension', 'fontFamily', 'fontWeight', 'number', 'unknown'] as const

    const values = kinds.map(
      (type) => ({ type, themes: { light: { value: 'x' } } }) satisfies TokenValue,
    )
    expect(values).toHaveLength(6)
  })

  it('refuse une nature inconnue', () => {
    // @ts-expect-error `spacing` ne fait pas partie des six natures
    const invalid = { type: 'spacing', themes: { light: { value: '4px' } } } satisfies TokenValue
    expect(invalid).toBeDefined()
  })

  // Une valeur unique aurait été le raccourci tentant, et le changer plus tard
  // toucherait chaque token. Voir §4.2 de docs/contracts.md.
  //
  // Rien d'autre que `type` dans l'objet : mesuré, la version avec un champ
  // `value` en trop passait aussi avec `themes` rendu optionnel, puisque la
  // directive était satisfaite par le champ excédentaire et non par l'absence.
  it('refuse un token sans thème', () => {
    // @ts-expect-error `themes` est requis, un token n'a pas de valeur unique
    const single = { type: 'color' } satisfies TokenValue
    expect(single).toBeDefined()
  })

  it('refuse un thème sans valeur littérale', () => {
    const aliasOnly = {
      type: 'color',
      // @ts-expect-error `value` est requis : un swatch ne résout pas la chaîne
      themes: { light: { alias: ['color-brand-primary'] } },
    } satisfies TokenValue
    expect(aliasOnly).toBeDefined()
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
