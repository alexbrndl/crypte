// The plugin contract, section 6 of docs/contracts.md. Frozen: 6.5 says what breaks it.

import type { Overrides } from './channel'
import type { ManifestEntry, StoryEntry } from './manifest'

export interface CryptePlugin {
  name: string
  // The module each browser surface lives in, as a file URL the plugin works out
  // itself: `new URL('./shell.mjs', import.meta.url).href`. A module and not the
  // surface: this object is built in Node, and only files reach the browser.
  // Reopened the day a plugin needs its own options in the browser: only the
  // URL crosses today.
  shell?: string
  preview?: string
  node?: NodeHooks
}

// What the shell module exports by default. Opaque like `Adapter`: a
// `ShellContribution` is a Vue component, section 6.1, which the core cannot
// name without Vue.
export type ShellContribution = unknown

// What the shell passes a panel, section 6.1. A panel declares the props it
// reads, a part of these: `defineProps<Pick<PanelProps, 'entry'>>()`.
export interface PanelProps {
  entry: StoryEntry | null
  received: { type: string; [key: string]: unknown } | null
  // Why the story on display could not be rendered, or `null`. A panel waiting
  // for that render, `a11y`'s analysis, otherwise waited for ever.
  failed?: string | null
}

// What a panel may emit, section 6.1, in the form `defineEmits` takes. A panel
// declares the events it emits, a part of these.
export interface PanelEvents {
  inapplicable: [reason: string | null]
  overrides: [values: Overrides]
  send: [message: { type: string; [key: string]: unknown }]
}

// What the preview module exports by default, section 6.2. Two hooks because
// `a11y` is the one consumer: analysing a story once it is mounted, and again
// when its panel asks. The rest of 6.2 waits in section 7 for the plugin that
// needs it. Properties holding functions, like `NodeHooks`, and possibly
// async, as an analysis is.
export interface PreviewHooks {
  afterMount?: (ctx: PreviewContext) => void | Promise<void>
  onMessage?: (
    ctx: PreviewContext,
    message: { type: string; [key: string]: unknown },
  ) => void | Promise<void>
}

// The story on display, once rendered. The iframe's DOM and never a
// framework's tree, section 6.2. `send` reaches the plugin's panel, with a
// `type` that starts with the plugin's name, section 5.4.
export interface PreviewContext {
  id: string
  props: Record<string, unknown>
  options: Record<string, unknown>
  root: HTMLElement
  send: (message: { type: string; [key: string]: unknown }) => void
}

// The one capability a real use demands: contributing entries to the manifest.
// A property holding a function, not a method: the context comes in as an
// argument, so a hook has no reason to read `this`.
export interface NodeHooks {
  entries?: (ctx: NodeContext) => ContributedEntry[]
}

// What the project declared, never what a plugin guesses. The producer runs
// before any server, so there is no Vite resolution to hand over, and a plugin's
// own settings come from its factory.
export interface NodeContext {
  root: string
  // The style sheet of 1.5, project-relative, when the project declares one.
  // A plugin that reads CSS has no other way to know which file is meant, and
  // guessing a path is what section 0 forbids.
  css?: string
}

// Stories excluded: they are read from story files, and a plugin injecting one
// would bypass discovery. `Exclude` rather than a list, so a nature added to the
// manifest widens this on its own.
export type ContributedEntry = Exclude<ManifestEntry, StoryEntry>

// The same set at run time, because `ContributedEntry` holds at compile time and
// a plugin arrives compiled: nothing in a published plugin stops it from handing
// over `type: 'story'`. A type test holds the two in step, `test/plugin.test-d.ts`.
export const CONTRIBUTABLE = ['tokens'] as const
