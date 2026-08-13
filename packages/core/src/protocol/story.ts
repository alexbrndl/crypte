// Ce qu'un développeur écrit dans un fichier de stories.

import type { PropDetails } from './prop'

export interface StoryDefinition<P, C> {
  props?: Partial<P>
  stories?: Record<string, Partial<P> | Story<P>>
  wrap?: Wrap<C>
  details?: Partial<Record<keyof P, PropDetails>>
  meta?: StoryMeta
}

// Une story nommée, quand la forme courte `{ price: 500 }` ne suffit plus.
export interface Story<P> {
  props: Partial<P>
  options?: StoryOptions
}

// L'aiguillage n'admet aucune clé tant que le point d'extension est vide : une
// interface sans propriété accepterait n'importe quel objet. Voir docs/internal/architecture.md.
export type StoryOptions = [keyof PluginStoryOptions] extends [never]
  ? Record<string, never>
  : PluginStoryOptions

// Le noyau ne connaît aucun framework : un composant reste une valeur opaque.
// Des composants, et rien d'autre : une fonction d'enveloppe ne se distinguerait
// pas d'un composant React, qui en est une. Voir la section 2.5 de la spec.
export type Wrap<C> = C | readonly WrapEntry<C>[]

// Dans la forme tableau, le premier élément est le plus externe.
export type WrapEntry<C> = C | readonly [C, Record<string, unknown>]

export interface StoryMeta {
  status?: 'draft' | 'stable' | 'deprecated'
  owner?: string
  figma?: string
  description?: string
}

// Vide ici. Un plugin y ajoute ses champs par augmentation de module :
// `declare module '@crypte/core/protocol' { interface PluginStoryOptions { responsive?: 'mobile' } }`
export interface PluginStoryOptions {}
