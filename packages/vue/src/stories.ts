// What a developer writes in a story file, for Vue: section 2.3 of
// docs/contracts.md. The same shape as `@crypte/react`'s, so the CLI reads both.

import type { Component } from 'vue'
import type { Story, StoryDefinition, StoryOptions } from '@crypte/core/protocol'

// Any component of this framework, used for wrappers.
export type AnyComponent = Component

// The props a component declares, read from the component itself: `$props` of
// what `defineComponent` or a `.vue` file gives, or a functional component's.
export type PropsOf<C> = C extends abstract new (...args: never[]) => { $props: infer P }
  ? P
  : C extends (props: infer P, ...rest: never[]) => unknown
    ? P
    : Record<string, unknown>

// What a story file exports by default, as `@crypte/react` has it.
export interface StoryModule<C> {
  component: C
  definition: StoryDefinition<PropsOf<C>, AnyComponent>
}

// Returns what it was given, typed: the CLI reads the file without running it.
export function defineStories<C extends Component>(
  component: C,
  definition: StoryDefinition<PropsOf<C>, AnyComponent> = {},
): StoryModule<C> {
  return { component, definition }
}

// Keeps props and options apart when a story needs both: section 2.4.
export function story<P>(props: Partial<P>, options?: StoryOptions): Story<P> {
  return options === undefined ? { props } : { props, options }
}
