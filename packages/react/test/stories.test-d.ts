import type { ComponentType } from 'react'
import { describe, expectTypeOf, it } from 'vitest'
import {
  defineStories,
  story,
  type AnyComponent,
  type PropsOf,
  type StoryModule,
} from '../src/stories'

// Ce que l'inférence du paquet promet, éprouvé à la compilation. Aucun test
// d'exécution ne peut le voir : dégrader `PropsOf` en `any` laissait `vp check`
// et les 480 cas au vert, mesuré. Voir docs/internal/architecture.md.

interface BadgeProps {
  label: string
  tone?: 'neutral' | 'warning'
}

const Badge = (_props: BadgeProps) => null
const Provider = (_props: { children?: unknown }) => null

describe('PropsOf', () => {
  // `any` est le mode d'échec silencieux : il accepte tout, donc plus rien n'est
  // vérifié dans un fichier de story, et aucun cas d'exécution ne s'en aperçoit.
  it('rend exactement les props du composant, jamais any', () => {
    expectTypeOf<PropsOf<typeof Badge>>().toEqualTypeOf<BadgeProps>()
    expectTypeOf<PropsOf<typeof Badge>>().not.toBeAny()
  })

  // Le second embranchement du type conditionnel : ce qui n'est pas un composant
  // ne porte pas de props.
  it('rend never sur ce qui n’est pas un composant', () => {
    expectTypeOf<PropsOf<string>>().toBeNever()
  })
})

describe('defineStories', () => {
  it('porte le composant reçu, sans l’élargir', () => {
    expectTypeOf(defineStories(Badge)).toEqualTypeOf<StoryModule<typeof Badge>>()
    expectTypeOf(defineStories(Badge).component).toEqualTypeOf<typeof Badge>()
  })

  // Ce qui fait l'autocomplétion d'un fichier de story : les props de la
  // définition viennent du composant, pas d'un alias que l'auteur écrirait.
  it('type les props de la définition depuis le composant', () => {
    expectTypeOf(defineStories(Badge).definition.props).toEqualTypeOf<
      Partial<BadgeProps> | undefined
    >()
  })

  it('refuse une prop que le composant ne déclare pas', () => {
    // @ts-expect-error `taille` n'est pas une prop de Badge
    defineStories(Badge, { props: { label: 'Neuf', taille: 2 } })
  })

  // Une enveloppe n'a aucune raison d'accepter les props de la story, sans quoi
  // `wrap: Provider` cesserait de compiler sur `defineStories(Badge, …)`.
  it('accepte une enveloppe qui ne prend pas les props de la story', () => {
    expectTypeOf<AnyComponent>().toEqualTypeOf<ComponentType<never>>()
    defineStories(Badge, { wrap: Provider })
  })
})

describe('story', () => {
  it('accepte une part des props, et refuse une clé inconnue', () => {
    expectTypeOf(story<BadgeProps>({ label: 'Neuf' }).props).toEqualTypeOf<Partial<BadgeProps>>()

    // @ts-expect-error `taille` n'est pas une prop de Badge
    story<BadgeProps>({ taille: 2 })
  })
})
