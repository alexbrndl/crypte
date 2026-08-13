// The shell side of the channel.

import type { PreviewMessage, ShellMessage } from '../protocol/channel'

// Marker read by test/isolation.test.ts
export const UI_MARKER = '__crypte_ui__'

export interface ShellChannel {
  send(message: ShellMessage): void
  onMessage(handler: (message: PreviewMessage) => void): () => void
}

// Handles serialisable messages only, which is what keeps the shell neutral.
export function createShellChannel(frame: HTMLIFrameElement): ShellChannel {
  return {
    send(message) {
      // Never '*': the message would go to any page that took the iframe's
      // place.
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
