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
    // flushSync force le rendu à se terminer avant le retour. Sans lui, React commite
    // plus tard : une erreur du composant échapperait au try/catch de l'appelant, et
    // le message `rendered` partirait avant que quoi que ce soit ne soit à l'écran.
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
