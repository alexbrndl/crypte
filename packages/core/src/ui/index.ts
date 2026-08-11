// Côté shell du canal.

import type { PreviewMessage, ShellMessage } from '../protocol/index'

// Marqueur lu par test/isolation.test.ts
export const UI_MARKER = '__crypte_ui__'

export interface ShellChannel {
  send(message: ShellMessage): void
  onMessage(handler: (message: PreviewMessage) => void): () => void
}

// Ne manipule que des messages sérialisables, d'où l'agnosticisme du shell.
export function createShellChannel(frame: HTMLIFrameElement): ShellChannel {
  return {
    send(message) {
      // Jamais '*' : le message partirait vers toute page ayant pris la place
      // de l'iframe.
      frame.contentWindow?.postMessage(message, window.location.origin)
    },
    onMessage(handler) {
      const listener = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return
        if (event.source !== frame.contentWindow) return
        handler(event.data as PreviewMessage)
      }
      window.addEventListener('message', listener)
      return () => window.removeEventListener('message', listener)
    },
  }
}
