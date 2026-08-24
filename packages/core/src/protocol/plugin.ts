// The plugin contract. Provisional: see section 6 of docs/contracts.md.

import type { ManifestEntry, StoryEntry } from './manifest'

export interface CryptePlugin {
  name: string
  ui?: UIContribution
  preview?: PreviewHooks
  node?: NodeHooks
}

// Opaque like `Adapter`: named here, carried by the CLI, read by nobody yet.
// `UIContribution` waits for the first plugin that draws a panel, DCJ-194;
// section 6.2 already specifies `PreviewHooks`, and no preview calls it.
export type UIContribution = unknown
export type PreviewHooks = unknown

// The one capability a real use demands: contributing entries to the manifest.
// A property holding a function, not a method: the context comes in as an
// argument, so a hook has no reason to read `this`.
export interface NodeHooks {
  entries?: (ctx: NodeContext) => ContributedEntry[]
}

// Only the root. The producer runs before any server, so there is no Vite
// resolution to hand over, and a plugin's own options come from its factory.
export interface NodeContext {
  root: string
}

// Stories excluded: they are read from story files, and a plugin injecting one
// would bypass discovery. `Exclude` rather than a list, so a nature added to the
// manifest widens this on its own.
export type ContributedEntry = Exclude<ManifestEntry, StoryEntry>

// The same set at run time, because `ContributedEntry` holds at compile time and
// a plugin arrives compiled: nothing in a published plugin stops it from handing
// over `type: 'story'`. A type test holds the two in step, `test/plugin.test-d.ts`.
export const CONTRIBUTABLE = ['tokens'] as const
