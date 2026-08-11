import { describe, expect, it } from 'vitest'
import type { PropDetailsInput, StoryDefinition, StoryOptions } from '../../src/protocol/story'

// Les points d'extension sont remplis par `test/plugin-simulation.d.ts`, qui joue
// le rôle des plugins installés. Voir ce fichier pour ce qui est déclaré.

interface DemoProps {
  price: number
  label?: string
}

// Les assertions sont portées par `satisfies` et `@ts-expect-error`, donc évaluées
// à la compilation. Les `expect` qui suivent donnent seulement un corps au test.
describe('points d’extension', () => {
  it('accepte les réglages apportés par un plugin', () => {
    const override = { min: 0, max: 500, step: 10 } satisfies PropDetailsInput
    expect(override.max).toBe(500)
  })

  it('accepte les options apportées par un plugin', () => {
    const options = { responsive: 'mobile' } satisfies StoryOptions
    expect(options.responsive).toBe('mobile')
  })

  // Sans ce cas, les précédents passeraient à l'identique si le type acceptait
  // n'importe quelle clé : ils ne prouveraient plus rien.
  it('refuse une clé qu’aucun plugin n’a déclarée', () => {
    // @ts-expect-error `mni` n'est déclaré nulle part
    const typo = { mni: 0 } satisfies PropDetailsInput
    expect(typo).toBeDefined()
  })

  it('refuse une valeur du mauvais type', () => {
    // @ts-expect-error `min` est un nombre
    const wrong = { min: 'zéro' } satisfies PropDetailsInput
    expect(wrong).toBeDefined()
  })
})

describe('PropDetailsInput', () => {
  it('accepte aussi les champs décrits par le noyau', () => {
    const override = {
      options: ['a', 'b'],
      description: 'Une prop',
    } satisfies PropDetailsInput
    expect(override.options).toHaveLength(2)
  })
})

describe('StoryDefinition', () => {
  it('associe les détails aux props du composant', () => {
    const definition = {
      props: { price: 10 },
      stories: { 'Par défaut': {}, Cher: { price: 500 } },
      details: { price: { min: 0, max: 500, step: 10 } },
      meta: { status: 'stable' },
    } satisfies StoryDefinition<DemoProps, unknown>

    expect(Object.keys(definition.stories)).toEqual(['Par défaut', 'Cher'])
  })

  it('refuse des détails sur une prop qui n’existe pas', () => {
    const definition = {
      // @ts-expect-error `discount` n'est pas une prop de DemoProps
      details: { discount: { min: 0 } },
    } satisfies StoryDefinition<DemoProps, unknown>
    expect(definition).toBeDefined()
  })
})
