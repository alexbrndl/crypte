import {
  defineComponent,
  h,
  onErrorCaptured,
  render,
  type Component,
  type PropType,
  type VNode,
} from 'vue'
import type { Adapter, PreviewWrapper } from '@crypte/core/preview'

// The core's shapes, re-exported so a project names them from its adapter.
export type { Adapter, PreviewWrapper }

// The form section 1.5 shows: `adapter: vue()`.
export default function vue(): Adapter {
  let host: HTMLElement | null = null
  let caught: unknown

  // The root the story renders under, kept from one render to the next: `render`
  // patches synchronously, so a component of the same type keeps its state
  // across a props edit, and the story is on screen when `mount` returns. Not
  // `createApp`, whose updates wait for the next tick.
  const Root = defineComponent({
    props: { story: { type: Function as PropType<() => VNode>, required: true } },
    setup(props) {
      // What a descendant throws while rendering, kept for `mount` to rethrow.
      onErrorCaptured((error) => {
        caught ??= error
        return false
      })
      return () => props.story()
    },
  })

  return {
    mount(container, component, props, wraps = []) {
      for (const one of [component, ...wraps.map((wrap) => wrap.component)]) assertComponent(one)
      if (host !== null && host !== container) render(null, host)
      host = container
      caught = undefined
      render(h(Root, { story: () => nested(wraps, h(component as Component, props)) }), container)

      if (caught !== undefined) throw caught
    },
    unmount() {
      if (host !== null) render(null, host)
      host = null
    },
  }
}

// From the inside out, the first wrapper outermost: section 2.5. A wrapper gets
// the story through its default slot, which is how a Vue provider takes content.
function nested(wraps: readonly PreviewWrapper[], story: VNode): VNode {
  return wraps.reduceRight<VNode>(
    (child, wrap) => h(wrap.component as Component, wrap.props, { default: () => child }),
    story,
  )
}

// Vue renders an empty comment for what is not a component, and warns rather
// than throws: the story would vanish and the preview announce it rendered.
// A `template` with no `render` is the common case: Vite's Vue build compiles no
// template at run time, only `.vue` files ahead of time.
function assertComponent(value: unknown): void {
  if (typeof value === 'function') return
  const object = value !== null && typeof value === 'object' ? value : undefined
  if (object && ('render' in object || 'setup' in object)) return
  if (object && 'template' in object)
    throw new TypeError(
      'a component declares a `template` but no render function: Vue compiles templates ahead of time, so write it in a `.vue` file',
    )
  throw new TypeError(`${describe(value)} is not a Vue component`)
}

function describe(value: unknown): string {
  if (value === undefined || value === null) return String(value)
  if (typeof value === 'object') return 'an object with neither `render` nor `setup`'
  return `a ${typeof value}`
}

export { defineStories, story, type AnyComponent, type PropsOf, type StoryModule } from './stories'
