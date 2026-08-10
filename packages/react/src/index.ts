import { createElement, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'

export const ADAPTER_NAME = 'react'

export interface Adapter {
  mount(container: HTMLElement, component: ComponentType<any>, props: Record<string, unknown>): void
  unmount(): void
}

export function createAdapter(): Adapter {
  let root: Root | null = null

  return {
    mount(container, component, props) {
      root ??= createRoot(container)
      root.render(createElement(component, props))
    },
    unmount() {
      root?.unmount()
      root = null
    },
  }
}
