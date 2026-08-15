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

  return {
    // `flushSync` makes the render finish before returning. Without it React
    // commits later: a component error would escape the caller's try/catch, and
    // the `rendered` message would leave before anything is on screen.
    mount(container, component, props) {
      root ??= createRoot(container)
      const target = root
      flushSync(() => {
        target.render(createElement(component, props))
      })
    },
    unmount() {
      root?.unmount()
      root = null
    },
  }
}

export {
  defineStories,
  propsOfStory,
  story,
  type AnyComponent,
  type PropsOf,
  type StoryModule,
} from './stories'
