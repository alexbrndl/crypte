// Côté iframe du canal.

import { PROTOCOL_VERSION, type PreviewMessage, type ShellMessage } from '../protocol/channel'

// Marqueur lu par test/isolation.test.ts
export const PREVIEW_MARKER = '__crypte_preview__'

export interface PreviewHandlers {
  render(id: string, overrides: Record<string, unknown>): void
}

// Ne sait rien du framework de rendu : c'est l'adaptateur qui s'en charge.
export function createPreviewChannel(handlers: PreviewHandlers): () => void {
  // Jamais '*' : toute page ayant ouvert cette preview en iframe pourrait lire
  // les messages et en envoyer.
  const origin = window.location.origin
  const reply = (message: PreviewMessage) => window.parent.postMessage(message, origin)

  const listener = (event: MessageEvent) => {
    if (event.origin !== origin) return
    if (event.source !== window.parent) return

    const message = event.data as ShellMessage
    if (message?.type !== 'render') return

    const startedAt = performance.now()
    try {
      handlers.render(message.id, message.overrides)
      reply({ type: 'rendered', id: message.id, durationMs: performance.now() - startedAt })
    } catch (error) {
      reply({
        type: 'error',
        id: message.id,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
  }

  window.addEventListener('message', listener)
  reply({ type: 'ready', protocolVersion: PROTOCOL_VERSION })

  return () => window.removeEventListener('message', listener)
}
