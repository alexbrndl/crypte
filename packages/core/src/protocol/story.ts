// Ce qu'un développeur écrit dans un fichier de stories.
// Consommé par les adaptateurs, qui exposent `defineStories`, et par le CLI, qui
// lit ces déclarations pour produire le manifeste.

import type { ArgType } from './manifest'

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

// Point d'extension, vide dans le noyau. Un plugin le remplit depuis son propre
// paquet par augmentation de module, sans qu'aucune ligne du noyau ne change :
//
//   declare module '@crypte/core/protocol' {
//     interface PluginStoryOptions { responsive?: 'mobile' | 'desktop' }
//   }
//
// Le préfixe dit qu'aucun champ ne vient d'ici. Conséquence voulue : sans le
// plugin installé, l'option est refusée, puisque personne ne la lirait.
export interface PluginStoryOptions {}

export type StoryOptions = PluginStoryOptions

export interface Story<P> {
  props: Partial<P>
  options: StoryOptions
}

// Second point d'extension, même mécanisme. Les bornes d'un curseur appartiennent
// au plugin qui les affiche, pas au noyau qui les transporte.
export interface PluginControlSettings {}

// Une déclaration explicite ne remplace que les champs qu'elle mentionne : tous
// les autres restent issus de l'inférence.
export interface ControlOverride extends Partial<Omit<ArgType, 'name'>>, PluginControlSettings {}

export interface StoryDefinition<P, C> {
  props?: Partial<P>
  stories?: Record<string, Partial<P> | Story<P>>
  wrap?: Wrap<C>
  controls?: Partial<Record<keyof P, ControlOverride>>
  meta?: EntryMeta
}
