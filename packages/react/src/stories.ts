// What a developer writes in a story file, for React.
//
// The types live here and not in the core: the core knows no framework, and
// inferring a component's props is exactly the framework's business.
// See section 2.3 of docs/contracts.md.

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

// Returns what it was given, typed. There is nothing to compute: the CLI reads
// the file without running it, and the preview needs the component and the
// definition, not a transformation of them.
//
// Doing more here would put a second source of truth beside the reader, and the
// two would drift the day one of them learns something the other does not.
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

// The props a named story passes to the component: the shared block first, its
// own on top. The merge is shallow, prop by prop, which is what makes two
// mutually exclusive props need an explicit reset.
export function propsOfStory<C>(module: StoryModule<C>, name: string): PropsOf<C> {
  const { props = {}, stories = {} } = module.definition
  const declared = stories[name]
  const own = declared === undefined ? {} : 'props' in declared ? declared.props : declared

  return { ...props, ...own } as PropsOf<C>
}
