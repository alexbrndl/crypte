import { createElement, type ComponentType } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'

export const ADAPTER_NAME = 'react'

export type ComponentProps = Record<string, unknown>

export interface Adapter {
  mount(
    container: HTMLElement,
    component: ComponentType<ComponentProps>,
    props: ComponentProps,
  ): void
  unmount(): void
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
    mount(container, component, props) {
      caught = undefined
      root ??= createRoot(container, {
        onUncaughtError(error) {
          caught = error
        },
      })
      const target = root
      flushSync(() => {
        target.render(createElement(component, props))
      })

      if (caught !== undefined) throw caught
    },
    unmount() {
      root?.unmount()
      root = null
    },
  }
}

export { defineStories, story, type AnyComponent, type PropsOf, type StoryModule } from './stories'
