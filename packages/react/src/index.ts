import { createElement, type ComponentType, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'

export const ADAPTER_NAME = 'react'

export type ComponentProps = Record<string, unknown>

export interface Adapter {
  mount(
    container: HTMLElement,
    component: ComponentType<ComponentProps>,
    props: ComponentProps,
    // The wrappers the story renders inside, outermost first, as
    // `wrapsOf` flattens them. Optional so an adapter written against the
    // previous shape keeps compiling. See docs/contracts.md section 2.5.
    wraps?: readonly Wrapper[],
  ): void
  unmount(): void
}

// One wrapper and the props it was declared with, which may be none.
export interface Wrapper {
  component: ComponentType<{ children?: unknown }>
  props: ComponentProps
}

export function createAdapter(): Adapter {
  let root: Root | null = null
  let caught: unknown

  return {
    // `flushSync` makes the render finish before returning. Without it React
    // commits later: a component error would escape the caller's try/catch, and
    // the `rendered` message would leave before anything is on screen.
    //
    // `onUncaughtError` and the rethrow are what actually surface the error.
    // Measured in a browser: React 19 reports a component that throws as an
    // unhandled error and does **not** rethrow to the caller, so `mount`
    // returned as if it had rendered and the preview announced `rendered`.
    mount(container, component, props, wraps = []) {
      caught = undefined
      root ??= createRoot(container, {
        onUncaughtError(error) {
          caught = error
        },
      })
      const target = root
      flushSync(() => {
        target.render(nested(wraps, createElement(component, props)))
      })

      if (caught !== undefined) throw caught
    },
    unmount() {
      root?.unmount()
      root = null
    },
  }
}

// From the inside out: the last wrapper is the closest to the component, so
// folding from the right puts the first one outermost. That order is the whole
// of section 2.5, and reversing it would render a router inside its theme.
function nested(wraps: readonly Wrapper[], story: ReactNode): ReactNode {
  return wraps.reduceRight<ReactNode>(
    (child, wrap) => createElement(wrap.component, wrap.props, child),
    story,
  )
}

export { defineStories, story, type AnyComponent, type PropsOf, type StoryModule } from './stories'
