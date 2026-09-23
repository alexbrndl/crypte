// What a developer writes in a story file, for React: section 2.3 of
// docs/contracts.md. Here and not in the core, which knows no framework.

import type { ComponentType } from 'react'
import type { Story, StoryDefinition, StoryOptions } from '@crypte/core/protocol'

// Any component of this framework, used for wrappers. Deliberately not the type
// of the story's own component: a wrapper has no reason to accept its props, and
// `wrap: TooltipProvider` would stop compiling on `defineStories(Badge, …)`.
export type AnyComponent = ComponentType<never>

// The props a component takes, read from the component itself. Everything a
// story file types flows from here, so no story ever writes a type alias.
export type PropsOf<C> = C extends ComponentType<infer P> ? P : never

// What a story file exports by default. The preview imports it and mounts from
// it, so it carries the component itself and not a description of it.
export interface StoryModule<C> {
  component: C
  definition: StoryDefinition<PropsOf<C>, AnyComponent>
}

// Returns what it was given, typed. Nothing is computed here: the CLI reads the
// file without running it, so added logic would be a second source of truth.
export function defineStories<C extends ComponentType<never>>(
  component: C,
  definition: StoryDefinition<PropsOf<C>, AnyComponent> = {},
): StoryModule<C> {
  return { component, definition }
}

// Keeps props and options apart when a story needs both. The common case has no
// options and never uses this: section 2.4.
export function story<P>(props: Partial<P>, options?: StoryOptions): Story<P> {
  return options === undefined ? { props } : { props, options }
}
