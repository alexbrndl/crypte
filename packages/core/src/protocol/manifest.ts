// Le catalogue produit par le CLI et lu par le shell : une entrée par story, avec
// son identifiant, sa place dans l'arbre, son composant d'origine et ses argTypes.
// Ne contient que des données sérialisables.

import type { EntryMeta } from './story'

export const MANIFEST_VERSION = 1

export type ArgTypeKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'object'
  | 'array'
  | 'function'
  | 'node'
  | 'unknown'

export type ControlSpec = Record<string, unknown>

export interface ArgType {
  name: string
  type: ArgTypeKind
  required: boolean
  default?: unknown
  description?: string
  options?: unknown[]
  // `false` retire la prop du panneau sans la retirer de la documentation.
  control?: ControlSpec | false
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
  argTypes: Record<string, ArgType>
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
