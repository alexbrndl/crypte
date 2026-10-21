import { createApp, defineComponent, h, type App, type Component, type VNode } from 'vue'
import type { Adapter, PreviewWrapper } from '@crypte/core/preview'

export const ADAPTER_NAME = 'vue'

// The core's shapes, re-exported so a project names them from its adapter.
export type { Adapter, PreviewWrapper }

// The form section 1.5 shows: `adapter: vue()`.
export default function vue(): Adapter {
  let app: App | null = null

  return {
    // A new app on every render, never an update: Vue renders an update at the
    // next tick, so `mount` would return before the story is on screen and an
    // error would escape it. A first mount is synchronous. The cost is that a
    // component's own state starts over at each render, which `update-overrides`,
    // section 7, would reopen.
    mount(container, component, props, wraps = []) {
      app?.unmount()
      let caught: unknown
      const story = defineComponent({
        render: () => nested(wraps, h(component as Component, props)),
      })
      app = createApp(story)
      app.config.errorHandler = (error) => {
        caught ??= error
      }
      app.mount(container)

      if (caught !== undefined) throw caught
    },
    unmount() {
      app?.unmount()
      app = null
    },
  }
}

// From the inside out, the first wrapper outermost: section 2.5. A wrapper gets
// the story through its default slot, which is how a Vue provider takes content.
function nested(wraps: readonly PreviewWrapper[], story: VNode): VNode {
  return wraps.reduceRight<VNode>(
    // The one cast of this file: the core cannot know a wrapper is a component.
    (child, wrap) => h(wrap.component as Component, wrap.props, { default: () => child }),
    story,
  )
}

export { defineStories, story, type AnyComponent, type PropsOf, type StoryModule } from './stories'
