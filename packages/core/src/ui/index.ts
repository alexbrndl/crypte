import type { PreviewMessage, ShellMessage } from '../protocol/index'

// Marqueur unique : sert au test d'isolation des entrées (test/isolation.test.ts)
export const UI_MARKER = '__crypte_ui__'

export interface ShellChannel {
  send(message: ShellMessage): void
  onMessage(handler: (message: PreviewMessage) => void): () => void
}

// Côté shell du canal. Ne manipule que des messages sérialisables : aucun accès
// au framework de rendu, c'est ce qui rend le shell agnostique.
export function createShellChannel(frame: HTMLIFrameElement): ShellChannel {
  return {
    send(message) {
      frame.contentWindow?.postMessage(message, '*')
    },
    onMessage(handler) {
      const listener = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow) return
        handler(event.data as PreviewMessage)
      }
      window.addEventListener('message', listener)
      return () => window.removeEventListener('message', listener)
    },
  }
}
