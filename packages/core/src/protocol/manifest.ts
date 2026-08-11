// Le catalogue produit par le CLI et lu par le shell : une entrée par story, avec
// son identifiant, sa place dans l'arbre, son composant d'origine et les détails
// de ses props. Ne contient que des données sérialisables.

import type { EntryMeta } from './story'

export const MANIFEST_VERSION = 1

export type PropKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'object'
  | 'array'
  | 'function'
  | 'node'
  | 'unknown'

// Point d'extension, vide dans le noyau. Un plugin y ajoute ses champs depuis son
// propre paquet, par augmentation de module :
//
//   declare module '@crypte/core/protocol' {
//     interface PluginPropDetails { min?: number; control?: false }
//   }
//
// Les bornes d'un curseur et le réglage d'un panneau d'édition n'ont aucun sens
// sans le plugin qui les lit : le noyau n'a pas à les connaître.
export interface PluginPropDetails {}

// Ce que le noyau décrit d'une prop, et lui seul : ce qui vaut indépendamment de
// tout plugin, parce que la documentation existe sans qu'aucun ne soit installé.
export interface PropDetails extends PluginPropDetails {
  name: string
  type: PropKind
  required: boolean
  default?: unknown
  description?: string
  options?: unknown[]
}

export interface ComponentRef {
  name: string
  file: string
  export: string
}

export interface StoryEntry {
  type: 'story'
  id: string
  path: string[]
  name: string
  component: ComponentRef
  storyFile: string
  // Transportées telles quelles, sans interprétation. Contrairement à
  // `StoryOptions` côté écriture, le type reste ouvert ici : un manifeste peut
  // avoir été produit par un projet dont les plugins ne sont pas ceux du lecteur.
  options: Record<string, unknown>
  details: Record<string, PropDetails>
  source: string
  meta?: EntryMeta
}

// Une seule valeur de `type` est implémentée. Les valeurs `page` et `tokens` sont
// réservées aux évolutions design system : le champ existe déjà pour qu'elles
// n'imposent pas de migration, l'implémentation viendra si un cas la réclame.
export type ManifestEntry = StoryEntry

export interface Manifest {
  version: number
  entries: ManifestEntry[]
}
