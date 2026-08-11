import type { EntryMeta, StoryOptions } from './story'

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
  options: StoryOptions
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
