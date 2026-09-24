import { wrapsOf, type PreviewWrapper } from '@crypte/core/preview'
import type { ComponentType } from 'react'
import { describe, expectTypeOf, it } from 'vitest'
import { createAdapter } from '../src/index'
import {
  defineStories,
  story,
  type AnyComponent,
  type PropsOf,
  type StoryModule,
} from '../src/stories'

// Ce que l'inférence du paquet promet, éprouvé à la compilation. Aucun test
// d'exécution ne peut le voir : dégrader `PropsOf` en `any` laissait `vp check`
// et les 480 cas au vert, mesuré.

interface BadgeProps {
  label: string
  tone?: 'neutral' | 'warning'
}

const Badge = (_props: BadgeProps) => null
const Provider = (_props: { children?: unknown }) => null

describe('PropsOf', () => {
  // `any` est le mode d'échec silencieux : il accepte tout, donc plus rien n'est
  // vérifié dans un fichier de story, et aucun cas d'exécution ne s'en aperçoit.
  it('returns exactly the component props, never any', () => {
    expectTypeOf<PropsOf<typeof Badge>>().toEqualTypeOf<BadgeProps>()
    expectTypeOf<PropsOf<typeof Badge>>().not.toBeAny()
  })

  // Le second embranchement du type conditionnel : ce qui n'est pas un composant
  // ne porte pas de props.
  it('returns never for what is not a component', () => {
    expectTypeOf<PropsOf<string>>().toBeNever()
  })
})

describe('defineStories', () => {
  it('carries the given component without widening it', () => {
    expectTypeOf(defineStories(Badge)).toEqualTypeOf<StoryModule<typeof Badge>>()
    expectTypeOf(defineStories(Badge).component).toEqualTypeOf<typeof Badge>()
  })

  // Ce qui fait l'autocomplétion d'un fichier de story : les props de la
  // définition viennent du composant, pas d'un alias que l'auteur écrirait.
  it('types the definition props from the component', () => {
    expectTypeOf(defineStories(Badge).definition.props).toEqualTypeOf<
      Partial<BadgeProps> | undefined
    >()
  })

  it('refuses a prop the component does not declare', () => {
    // @ts-expect-error `taille` n'est pas une prop de Badge
    defineStories(Badge, { props: { label: 'Neuf', taille: 2 } })
  })

  // Une enveloppe n'a aucune raison d'accepter les props de la story, sans quoi
  // `wrap: Provider` cesserait de compiler sur `defineStories(Badge, …)`.
  it('accepts a wrapper that does not take the story props', () => {
    expectTypeOf<AnyComponent>().toEqualTypeOf<ComponentType<never>>()
    defineStories(Badge, { wrap: Provider })
  })
})

describe('story', () => {
  it('accepts part of the props and refuses an unknown key', () => {
    expectTypeOf(story<BadgeProps>({ label: 'Neuf' }).props).toEqualTypeOf<Partial<BadgeProps>>()

    // @ts-expect-error `taille` n'est pas une prop de Badge
    story<BadgeProps>({ taille: 2 })
  })
})

// La contrainte que les autres cas ne voient pas : retirer `C extends
// ComponentType<never>` les laisse tous verts, `PropsOf<42>` valant `never` sans
// faire échouer une assertion. Mesuré.
describe('the defineStories constraint', () => {
  it('refuses what is not a component', () => {
    // @ts-expect-error un nombre n'est pas un composant
    defineStories(42)
  })
})

// Le joint entre les deux paquets publiés : ce que `wrapsOf` rend doit entrer
// dans `mount` sans cast. Ils sont faits pour s'emboîter, et rien ne le voyait,
// l'entrée générée étant du JavaScript.
describe('the seam with core', () => {
  it('accepts the list wrapsOf returns as is', () => {
    const adapter = createAdapter()
    const wraps = wrapsOf(undefined, { wrap: Badge })

    expectTypeOf(wraps).toEqualTypeOf<PreviewWrapper[]>()
    expectTypeOf(adapter.mount).parameter(3).toEqualTypeOf<readonly PreviewWrapper[]>()
  })
})
