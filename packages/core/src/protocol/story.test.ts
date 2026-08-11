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
