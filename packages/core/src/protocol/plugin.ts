// The plugin contract, section 6 of docs/contracts.md. Frozen: 6.5 says what breaks it.

import type { Overrides, RenderedValues } from './channel'
import type { ManifestEntry, PageEntry, StoryEntry } from './manifest'
import type { ResolvedPropDetails } from './prop'

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
  // A view of its own in the activity bar, section 6.1: its label and icon here,
  // its canvas, sidebar and panel from the `view` export of the shell module.
  view?: PluginView
}

export interface PluginView {
  // Eight characters at most: the activity bar is 48 px wide. One per language
  // the shell speaks, English required: the shell shows it in its language.
  label: string | ViewLabel
  // The Hugeicons object the plugin imports from `@hugeicons/core-free-icons`:
  // a name would make the shell carry the whole set.
  icon: ReadonlyArray<readonly [string, Readonly<Record<string, string | number>>]>
}

// A view's label in each language the shell speaks. English is required, the one
// shown when the shell's language has none.
export interface ViewLabel {
  en: string
  fr?: string
}

// The languages the shell speaks, which it passes to each panel and each part of
// a view: a plugin translates its own texts, in a dictionary of its own.
export type Locale = 'en' | 'fr'

// What the shell module exports as `view`, section 6.1: Vue components, opaque
// like `ShellContribution`. The canvas is required, a view without one draws
// nothing.
export interface ShellView {
  canvas: ShellContribution
  sidebar?: ShellContribution
  panel?: ShellContribution
}

// What the shell passes each part of a plugin's view: the item chosen, which the
// address holds, `?view=<plugin>&item=<key>`, so a link reopens it. One part
// emits `item` to choose another, `null` to choose none.
export interface ViewProps {
  item: string | null
  // The shell's language, to draw the view's texts in.
  locale?: Locale
}

export interface ViewEvents {
  item: [key: string | null]
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
  // What the story on display last rendered with, or `null` before it renders.
  values?: RenderedValues | null
  // What this panel last edited and the shell still holds for the story on
  // display: a panel that edits reads its values here rather than keeping its
  // own, so the shell can reset them.
  overrides?: Overrides
  // The shell's language, to draw the panel's texts in.
  locale?: Locale
  // Where the panel puts its buttons: the action slot of its header, beside
  // "Reset all", which a `<Teleport>` reaches. `null` until the frame mounts it.
  actions?: HTMLElement | null
}

// What a panel may emit, section 6.1, in the form `defineEmits` takes. A panel
// declares the events it emits, a part of these.
export interface PanelEvents {
  inapplicable: [reason: string | null]
  overrides: [values: Overrides]
  send: [message: { type: string; [key: string]: unknown }]
}

// What the preview module exports by default, section 6.2. `a11y` analyses a
// story once it is mounted and again when its panel asks; `actions` fills its
// function props before the mount. The rest of 6.2 waits in section 7 for the
// plugin that needs it. Properties holding functions, like `NodeHooks`.
export interface PreviewHooks {
  // Synchronous, since the mount waits for it, and in the order of `plugins`:
  // each one sees the props the one before left, section 6.4.
  beforeMount?: (ctx: MountContext) => void
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
// The story about to be drawn: no root yet, and the one moment its `props` may
// be changed, section 6.4. `details` says which of them are functions.
export interface MountContext {
  id: string
  props: Record<string, unknown>
  options: Record<string, unknown>
  details: Record<string, ResolvedPropDetails>
  send: (message: { type: string; [key: string]: unknown }) => void
}

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

// Stories and pages excluded: they are read from the story folder, and a plugin
// injecting one would bypass discovery. `Exclude` rather than a list, so a nature
// added to the manifest widens this on its own. Pages reopen if a plugin needs to
// write one, a generated changelog for instance.
export type ContributedEntry = Exclude<ManifestEntry, StoryEntry | PageEntry>

// The same set at run time, because `ContributedEntry` holds at compile time and
// a plugin arrives compiled: nothing in a published plugin stops it from handing
// over `type: 'story'`. A type test holds the two in step, `test/plugin.test-d.ts`.
export const CONTRIBUTABLE = ['tokens'] as const
