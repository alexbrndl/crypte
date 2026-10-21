import type { Adapter as CoreAdapter } from '@crypte/core/preview'
import { defineComponent, h, type FunctionalComponent } from 'vue'
import { describe, expectTypeOf, it } from 'vitest'
import vue, { defineStories, story, type PropsOf } from '../src/index'

// Ce que l'inférence du paquet promet, éprouvé à la compilation : `PropsOf`
// dégradé en `Record<string, unknown>` laisserait tout passer dans un fichier de
// story, et aucun cas d'exécution ne le verrait.

const Badge = defineComponent({
  props: {
    label: { type: String, required: true },
    tone: { type: String as () => 'neutral' | 'warning', default: 'neutral' },
  },
  setup: (props) => () => h('span', props.label),
})

const Pastille: FunctionalComponent<{ couleur: string }> = (props) => h('i', props.couleur)

describe('PropsOf', () => {
  it('reads the props of a component', () => {
    expectTypeOf<PropsOf<typeof Badge>>().toHaveProperty('label').toEqualTypeOf<string>()
    expectTypeOf<PropsOf<typeof Badge>>().toHaveProperty('tone')
  })

  it('reads the props of a functional component', () => {
    expectTypeOf<PropsOf<typeof Pastille>>().toHaveProperty('couleur').toEqualTypeOf<string>()
    expectTypeOf<PropsOf<typeof Pastille>>().not.toHaveProperty('label')
  })
})

describe('defineStories', () => {
  it('types a story against the component props', () => {
    defineStories(Badge, { props: { label: 'Neuf' }, stories: { Alerte: { tone: 'warning' } } })
    defineStories(Pastille, { stories: { Rouge: story({ couleur: 'red' }, { layout: 'padded' }) } })
  })

  it('refuses a prop the component does not take, or a value of the wrong type', () => {
    // @ts-expect-error `taille` n'est pas une prop de Badge.
    defineStories(Badge, { props: { taille: 'lg' } })
    // @ts-expect-error `tone` ne prend que deux valeurs.
    defineStories(Badge, { stories: { Faux: { tone: 'rouge' } } })
  })
})

describe('the adapter type', () => {
  it('satisfies the core type', () => {
    expectTypeOf(vue()).toExtend<CoreAdapter>()
  })
})
