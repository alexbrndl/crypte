// The catalogue the CLI writes and the shell reads.
//
// It has to survive a JSON round trip, and the types do not enforce it:
// `unknown` accepts a function, which `JSON.stringify` would drop in silence.
// The CLI guarantees what it writes. See section 4.5 of docs/contracts.md.

import type { ResolvedPropDetails } from './prop'
import type { StoryMeta } from './story'

export interface Manifest {
  // Not `typeof MANIFEST_VERSION`: this field exists to spot a manifest written
  // by another version, a comparison a frozen type would make impossible.
  version: number
  entries: ManifestEntry[]
}

// `page` and `tokens` are reserved for design-system work: the field is here so
// that they will not force a migration.
export type ManifestEntry = StoryEntry

export interface StoryEntry {
  type: 'story'
  id: string
  path: string[]
  name: string
  component: ComponentRef
  storyFile: string
  // Open because this field only holds plugin settings: the core has nothing to
  // type here, and the reader may not have the same plugins.
  options: Record<string, unknown>
  // Keyed by prop name, hence no `name` field in the value.
  details: Record<string, ResolvedPropDetails>
  source: string
  meta?: StoryMeta
}

export interface ComponentRef {
  name: string
  file: string
  export: string
}

export const MANIFEST_VERSION = 1
