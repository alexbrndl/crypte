// What a developer writes in a story file.

import type { PropDetails } from './prop'

export interface StoryDefinition<P, C> {
  props?: Partial<P>
  stories?: Record<string, Partial<P> | Story<P>>
  wrap?: Wrap<C>
  details?: Partial<Record<keyof P, PropDetails>>
  meta?: StoryMeta
}

// A named story, for when the short form `{ price: 500 }` is not enough.
export interface Story<P> {
  props: Partial<P>
  options?: StoryOptions
}

// The core's own options, and those the installed plugins declare.
export type StoryOptions = CoreStoryOptions & PluginStoryOptions

// Where the story sits in the stage: centred, the default, with a margin, or on
// the whole frame, for a page or a bar.
export interface CoreStoryOptions {
  layout?: 'centered' | 'padded' | 'fullscreen'
}

// The core knows no framework: a component stays an opaque value.
// Components only: a wrapper function would not differ from a React component,
// which is one. See section 2.5 of docs/contracts.md.
export type Wrap<C> = C | readonly WrapEntry<C>[]

// In the array form, the first entry is the outermost.
export type WrapEntry<C> = C | readonly [C, Record<string, unknown>]

export interface StoryMeta {
  status?: 'draft' | 'stable' | 'deprecated'
  owner?: string
  figma?: string
  description?: string
}

// Empty here. A plugin adds its own fields by module augmentation:
// `declare module '@crypte/core/protocol' { interface PluginStoryOptions { responsive?: 'mobile' } }`
export interface PluginStoryOptions {}
