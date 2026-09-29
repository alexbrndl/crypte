// The iframe side of the channel.

import { PROTOCOL_VERSION, type PreviewMessage, type ShellMessage } from '../protocol/channel'
import type { PreviewContext, PreviewHooks } from '../protocol/plugin'

// Marker read by test/isolation.test.ts
export const PREVIEW_MARKER = '__crypte_preview__'

export interface PreviewHandlers {
  render(id: string, overrides: Record<string, unknown>): void
  // A plugin message, told by the colon its `type` carries, section 5.4.
  message?(message: { type: string }): void
}

export interface PreviewChannel {
  // Stops listening.
  dispose(): void
  // Draws the last story again through the same path: drawing it from outside
  // skips the error reporting, and the shell stays on `rendered`.
  again(): void
  send(message: PreviewMessage): void
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

    // Read raw first: with no plugin declared, `ShellMessage` holds `render`
    // alone, and anything else narrows to `never`.
    const type: unknown = (event.data as { type?: unknown } | null)?.type
    if (typeof type !== 'string') return

    if (type === 'render') {
      const message = event.data as Extract<ShellMessage, { type: 'render' }>
      asked = { id: message.id, overrides: message.overrides }
      draw(asked)
    } else if (type.includes(':')) handlers.message?.(event.data as { type: string })
  }

  window.addEventListener('message', listener)
  reply({ type: 'ready', protocolVersion: PROTOCOL_VERSION })

  return {
    dispose: () => window.removeEventListener('message', listener),
    again: () => {
      if (asked) draw(asked)
    },
    send: reply,
  }
}

// What the preview calls, and nothing else. A hook of section 7's reserve, or a
// typo, would otherwise be exported and never called, without a word: that is
// how `beforeRender` was ignored for a whole lot.
const HOOKS = ['afterMount', 'onMessage']

// A plugin's preview module as the entry loaded it: its module, or what it threw.
export type LoadedPlugin = { name: string; module: unknown } | { name: string; error: unknown }

export interface PluginHost {
  // After each render that went through, with the story it drew.
  mounted(story: Omit<PreviewContext, 'send'>): void
  // A message from the shell, for the plugin its `type` names.
  received(message: { type: string }): void
}

// Where the plugins' hooks are called. Nothing a plugin does costs a story: a
// module that does not load, one that exports no hooks, a hook that throws,
// each is refused, said in the console, and sent to the shell as `plugin-error`.
export function createPluginHost(
  loaded: LoadedPlugin[],
  send: (message: PreviewMessage) => void,
): PluginHost {
  const said = (plugin: string, message: string) => {
    console.error(`crypte: ${plugin}: ${message}`)
    send({ type: 'plugin-error', plugin, message })
  }

  const plugins: { name: string; hooks: PreviewHooks }[] = []

  for (const one of loaded) {
    if ('error' in one) {
      said(one.name, `its preview module could not load: ${text(one.error)}`)
      continue
    }

    // Read inside a `try`: a getter on the export can throw, and the host
    // throwing here would take the whole entry down with it.
    let hooks: PreviewHooks | string
    try {
      hooks = hooksOf(one.module)
    } catch (error) {
      hooks = `its preview module could not be read: ${text(error)}`
    }

    if (typeof hooks === 'string') said(one.name, hooks)
    else plugins.push({ name: one.name, hooks })
  }

  // The story last drawn, which a message is answered against.
  let last: Omit<PreviewContext, 'send'> | undefined

  const contextOf = (name: string, story: Omit<PreviewContext, 'send'>): PreviewContext => ({
    ...story,
    send: (message) => {
      // The prefix is what tells the shell whose message it is: without it, the
      // message would reach no panel, or another plugin's.
      const type: unknown = message?.type
      if (typeof type !== 'string' || !type.startsWith(`${name}:`)) {
        said(name, `it sent \`${String(type)}\`, whose type does not start with \`${name}:\``)
        return
      }
      send(message as PreviewMessage)
    },
  })

  // A hook may be async, as an analysis is: a rejection is refused like a
  // throw, instead of ending as a rejection nobody handles.
  const call = (name: string, hook: string, run: () => unknown) => {
    const refuse = (error: unknown) => said(name, `\`${hook}\` threw: ${text(error)}`)

    try {
      const result = run()
      if (typeof (result as { then?: unknown } | null)?.then === 'function')
        (result as Promise<unknown>).then(undefined, refuse)
    } catch (error) {
      refuse(error)
    }
  }

  return {
    mounted(story) {
      last = story
      for (const { name, hooks } of plugins) {
        const { afterMount } = hooks
        if (afterMount) call(name, 'afterMount', () => afterMount(contextOf(name, story)))
      }
    },
    received(message) {
      const name = message.type.slice(0, message.type.indexOf(':'))
      const onMessage = plugins.find((one) => one.name === name)?.hooks.onMessage

      if (!onMessage) return console.error(`crypte: no preview hook receives \`${message.type}\``)
      if (!last)
        return console.error(`crypte: \`${message.type}\` arrived before any story rendered`)

      const story = last
      call(name, 'onMessage', () => onMessage(contextOf(name, story), message))
    },
  }
}

// A module's hooks, or why they cannot be used: its default export must be an
// object whose keys are hooks the preview calls, each holding a function.
function hooksOf(module: unknown): PreviewHooks | string {
  const hooks: unknown = (module as { default?: unknown } | null)?.default

  if (typeof hooks !== 'object' || hooks === null || Array.isArray(hooks))
    return 'its preview module exports no object of hooks by default'

  for (const [key, value] of Object.entries(hooks)) {
    if (!HOOKS.includes(key))
      return `\`${key}\` is not a hook the preview calls, which are ${HOOKS.join(' and ')}`
    if (typeof value !== 'function') return `\`${key}\` is not a function`
  }

  return hooks as PreviewHooks
}

const text = (error: unknown) => (error instanceof Error ? error.message : String(error))

// Merge order: the shared block, the story's own props, then the shell's
// overrides. Shallow prop by prop, so two mutually exclusive props need an
// explicit reset: section 2.3 of docs/contracts.md.
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
): PreviewWrapper[] {
  return [...entriesOf(global), ...entriesOf(definition?.wrap)]
}

// One wrapper and the props it was declared with. `component` stays `unknown`:
// the core knows no framework, so it cannot say this is a component. The adapter
// can, and says it once.
export interface PreviewWrapper {
  component: unknown
  props: Record<string, unknown>
}

// A `Wrap` is one wrapper or an array of them, and an entry of that array is a
// wrapper or a `[wrapper, props]` pair. Any array entry is read as a pair: the
// type declares no other array shape.
function entriesOf(wrap: unknown): PreviewWrapper[] {
  if (wrap === undefined || wrap === null) return []
  if (!Array.isArray(wrap)) return [{ component: wrap, props: {} }]

  return wrap.flatMap((entry) => {
    if (!Array.isArray(entry)) return entriesOf(entry)

    const [component, props] = entry as [unknown, Record<string, unknown> | undefined]

    return component === undefined || component === null ? [] : [{ component, props: props ?? {} }]
  })
}
