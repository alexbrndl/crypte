import type { ArgType, ControlSpec } from './manifest'

// Le noyau ne connaît aucun framework : un composant et une enveloppe restent
// des valeurs opaques, que l'adaptateur précise en fournissant son propre type.
export type WrapEntry<C> = C | readonly [C, Record<string, unknown>]

// Dans la forme tableau, le premier élément est le plus externe.
export type Wrap<C> = C | readonly WrapEntry<C>[] | ((story: unknown) => unknown)

export interface EntryMeta {
  status?: 'draft' | 'stable' | 'deprecated'
  owner?: string
  figma?: string
  description?: string
}

// Options d'une story, typées par les plugins installés. Le noyau les transporte
// sans les interpréter.
export type StoryOptions = Record<string, unknown>

export interface Story<P> {
  props: Partial<P>
  options: StoryOptions
}

// Une déclaration explicite ne remplace que les champs qu'elle mentionne : tous
// les autres restent issus de l'inférence.
//
// Un override mélange deux natures : des champs de l'argType lui-même, comme
// `options` ou `description`, et des réglages du control au premier niveau, comme
// les bornes d'un curseur. La spécification écrit `{ min: 0, max: 500, step: 10 }`
// sans niveau intermédiaire, un type limité aux champs d'argType le refuserait.
export type ControlOverride = Partial<Omit<ArgType, 'name'>> & ControlSpec

export interface StoryDefinition<P, C> {
  props?: Partial<P>
  stories?: Record<string, Partial<P> | Story<P>>
  wrap?: Wrap<C>
  controls?: Partial<Record<keyof P, ControlOverride>>
  meta?: EntryMeta
}
