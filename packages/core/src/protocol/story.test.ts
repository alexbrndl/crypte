import { describe, expect, it } from 'vitest'
import type { ControlOverride, StoryDefinition } from './story'

interface DemoProps {
  price: number
  label?: string
}

// Ces déclarations valent assertion : `satisfies` échoue à la compilation si le
// type refuse la valeur, et `vp check` vérifie les types en local comme en CI.
describe('ControlOverride', () => {
  it('accepte des bornes de control au premier niveau, comme dans la spécification', () => {
    const override = { min: 0, max: 500, step: 10 } satisfies ControlOverride
    expect(override.max).toBe(500)
  })

  it('accepte aussi les champs issus de argType', () => {
    const override = {
      options: ['a', 'b'],
      description: 'Une prop',
    } satisfies ControlOverride
    expect(override.options).toHaveLength(2)
  })

  // Sans ce cas, les deux précédents passeraient à l'identique si le type
  // acceptait n'importe quelle clé : ils ne prouveraient plus rien.
  it('refuse une clé inconnue, donc une faute de frappe', () => {
    // @ts-expect-error `mni` n'est pas un réglage connu
    const typo = { mni: 0 } satisfies ControlOverride
    expect(typo).toBeDefined()
  })

  it('refuse une valeur du mauvais type', () => {
    // @ts-expect-error `description` est une chaîne
    const wrong = { description: 42 } satisfies ControlOverride
    expect(wrong).toBeDefined()
  })
})

describe('StoryDefinition', () => {
  it('associe les controls aux props du composant', () => {
    const definition = {
      props: { price: 10 },
      stories: { 'Par défaut': {}, Cher: { price: 500 } },
      controls: { price: { min: 0, max: 500, step: 10 } },
      meta: { status: 'stable' },
    } satisfies StoryDefinition<DemoProps, unknown>

    expect(Object.keys(definition.stories)).toEqual(['Par défaut', 'Cher'])
  })
})
