// The iframe side of the channel.

import { PROTOCOL_VERSION, type PreviewMessage, type ShellMessage } from '../protocol/channel'

// Marker read by test/isolation.test.ts
export const PREVIEW_MARKER = '__crypte_preview__'

export interface PreviewHandlers {
  render(id: string, overrides: Record<string, unknown>): void
}

export interface PreviewChannel {
  // Stops listening.
  dispose(): void
  // Draws the last story again, through the same path. A hot update changes the
  // modules, not what is on screen, and drawing it from the outside would skip
  // the reporting: a failing edit threw into the update callback, so no `error`
  // left and the shell kept the previous output with a « rendered » status.
  again(): void
}

// Knows nothing of the rendering framework: the adapter handles that.
export function createPreviewChannel(handlers: PreviewHandlers): PreviewChannel {
  // Never '*': any page that opened this preview in an iframe could read the
  // messages and send its own.
  const origin = window.location.origin
  const reply = (message: PreviewMessage) => window.parent.postMessage(message, origin)

  // What the shell last asked for. Held here rather than by the caller: the
  // reporting belongs to the same place, and two owners would drift.
  let asked: { id: string; overrides: Record<string, unknown> } | undefined

  const draw = ({ id, overrides }: { id: string; overrides: Record<string, unknown> }) => {
    const startedAt = performance.now()
    try {
      handlers.render(id, overrides)
      reply({ type: 'rendered', id, durationMs: performance.now() - startedAt })
    } catch (error) {
      reply({
        type: 'error',
        id,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
  }

  const listener = (event: MessageEvent) => {
    if (event.origin !== origin) return
    if (event.source !== window.parent) return

    const message = event.data as ShellMessage
    if (message?.type !== 'render') return

    asked = { id: message.id, overrides: message.overrides }
    draw(asked)
  }

  window.addEventListener('message', listener)
  reply({ type: 'ready', protocolVersion: PROTOCOL_VERSION })

  return {
    dispose: () => window.removeEventListener('message', listener),
    again: () => {
      if (asked) draw(asked)
    },
  }
}

// The props a named story passes to its component: the shared block first, its
// own on top, and the shell's overrides last. The merge is shallow, prop by
// prop, which is why two mutually exclusive props need an explicit reset:
// section 2.3 of docs/contracts.md.
//
// Here rather than in an adapter: merging plain objects knows no framework, and
// two adapters doing it apart would drift the day one of them learns something.
export function propsOfStory(
  definition: { props?: Record<string, unknown>; stories?: Record<string, unknown> },
  name: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const declared = definition.stories?.[name]
  const own =
    declared !== null && typeof declared === 'object' && 'props' in declared
      ? ((declared as { props?: Record<string, unknown> }).props ?? {})
      : ((declared as Record<string, unknown> | undefined) ?? {})

  return { ...definition.props, ...own, ...overrides }
}
