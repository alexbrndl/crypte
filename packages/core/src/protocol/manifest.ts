// The catalogue the CLI writes and the shell reads.
//
// It has to survive a JSON round trip, and the types do not enforce it:
// `unknown` accepts a function, which `JSON.stringify` would drop in silence.
// The CLI guarantees what it writes. See section 4.5 of docs/contracts.md.

import type { ResolvedPropDetails } from './prop'
import type { StoryMeta } from './story'
import type { TokenValue } from './tokens'

export interface Manifest {
  // Not `typeof MANIFEST_VERSION`: this field exists to spot a manifest written
  // by another version, a comparison a frozen type would make impossible.
  version: number
  entries: ManifestEntry[]
  // What a story file gave up on, so the shell can say it. Optional, so a
  // manifest written before it stays valid. Section 4.1 of docs/contracts.md.
  skipped?: SkippedFile[]
}

// A file, not an entry: a story that was set aside has no entry to hang a
// message on. `file` is the same project-relative path as `StoryEntry.storyFile`,
// so a reader counts what the file did give by comparing the two.
export interface SkippedFile {
  file: string
  reason: string
}

// `page` stays reserved for design-system work: the field is here so that it
// will not force a migration.
export type ManifestEntry = StoryEntry | TokensEntry

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
  // The props this story passes to the component, from the shared block and its
  // own, sorted. Names only: a value that cannot be serialised is still a prop
  // the story exercises, and coverage counts it.
  props: string[]
  source: string
  meta?: StoryMeta
  // Set when the record is incomplete though the story renders: a spread or a
  // computed key kept props out. Its text quotes what the file wrote, the
  // missing names being what cannot be read. Section 4.1 of docs/contracts.md.
  partial?: string
}

export interface ComponentRef {
  name: string
  file: string
  export: string
}

// One entry is a family shown as a page, not a single token. No `options`:
// nobody writes a tokens entry by hand, a plugin produces it.
export interface TokensEntry {
  type: 'tokens'
  id: string
  path: string[]
  name: string
  // Keyed by token name, hence no `name` field in the value, as `details` is.
  tokens: Record<string, TokenValue>
}

// Unchanged by `tokens`: the reserved `type` is what a new nature was for, and
// nothing required moved on `StoryEntry`. See docs/internal/suivi.md.
export const MANIFEST_VERSION = 1
