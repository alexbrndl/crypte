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

// The wrappers a story renders inside, outermost first, flattened from the two
// places section 2.5 of docs/contracts.md declares them: the config's `wrap`
// wraps the file's, which wraps the component. Each entry carries its own props,
// which may be none.
//
// Here rather than in an adapter, like `propsOfStory`: flattening this shape
// knows no framework, and it is the whole of the ordering rule. Nesting them is
// what belongs to the adapter, one `createElement` per entry for React.
export function wrapsOf(
  global: unknown,
  definition: { wrap?: unknown } | undefined,
): { component: unknown; props: Record<string, unknown> }[] {
  return [...entriesOf(global), ...entriesOf(definition?.wrap)]
}

// A `Wrap` is one wrapper or an array of them, and an entry of that array is a
// wrapper or a `[wrapper, props]` pair. Any array entry is read as a pair: the
// type declares no other array shape.
function entriesOf(wrap: unknown): { component: unknown; props: Record<string, unknown> }[] {
  if (wrap === undefined || wrap === null) return []
  if (!Array.isArray(wrap)) return [{ component: wrap, props: {} }]

  return wrap.flatMap((entry) => {
    if (!Array.isArray(entry)) return entriesOf(entry)

    const [component, props] = entry as [unknown, Record<string, unknown> | undefined]

    return component === undefined || component === null ? [] : [{ component, props: props ?? {} }]
  })
}
