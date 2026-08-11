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
      // Même origine que le shell : la preview est servie par le même serveur.
      // Un '*' diffuserait le message à toute page ayant pris la place de l'iframe.
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
