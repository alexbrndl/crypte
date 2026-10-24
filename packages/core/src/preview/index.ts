// The iframe side of the channel.

import {
  PROTOCOL_VERSION,
  type PreviewMessage,
  type RenderedValues,
  type ShellMessage,
  type Theme,
} from '../protocol/channel'
import type { PreviewContext, PreviewHooks } from '../protocol/plugin'

// Marker read by test/isolation.test.ts
export const PREVIEW_MARKER = '__crypte_preview__'

export interface PreviewHandlers {
  // What it returns is handed to `rendered`, and its `props`, the primitive
  // ones, travel to the shell with the `rendered` message.
  // `muted`: the ranks of the wrappers to leave out. What it returns may carry the
  // story's `wraps`, all of them, whose names travel with `rendered` too.
  render(id: string, overrides: Record<string, unknown>, muted?: readonly number[]): unknown
  // After a render that went through, once `rendered` is out: what runs here,
  // the plugins' `afterMount`, is not part of the time the shell shows.
  rendered?(drawn: unknown): void
  // A plugin message, told by the colon its `type` carries, section 5.4.
  message?(message: { type: string }): void
}

export interface PreviewChannel {
  // Stops listening.
  dispose(): void
  // Draws the last story again through the same path: drawing it from outside
  // skips the error reporting, and the shell stays on `rendered`.
  again(): void
  // Draws a story no shell asked for, through the same path: `iframe.html?id=`
  // has no shell, and its plugins and hot updates still follow the render.
  show(id: string): void
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
  let asked:
    | { id: string; overrides: Record<string, unknown>; theme?: Theme; muted?: number[] }
    | undefined

  const draw = ({
    id,
    overrides,
    theme,
    muted,
  }: {
    id: string
    overrides: Record<string, unknown>
    theme?: Theme
    muted?: number[]
  }) => {
    // Before the render, so the story mounts in its theme rather than repainting.
    if (theme) {
      const root = window.document.documentElement
      root.dataset.theme = theme
      root.style.colorScheme = theme
    }
    const startedAt = performance.now()
    let drawn: unknown
    try {
      drawn = handlers.render(id, overrides, muted)
      const wraps = (drawn as { wraps?: unknown } | null | undefined)?.wraps
      reply({
        type: 'rendered',
        id,
        durationMs: performance.now() - startedAt,
        values: primitivesOf((drawn as { props?: unknown } | null | undefined)?.props),
        ...(Array.isArray(wraps) ? { wraps: wraps.map((one) => wrapperName(one)) } : {}),
      })
    } catch (error) {
      reply({
        type: 'error',
        id,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      return
    }
    handlers.rendered?.(drawn)
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
      asked = {
        id: message.id,
        overrides: message.overrides,
        ...(message.theme ? { theme: message.theme } : {}),
        // Ranks only: the entry tests them with `includes`, and `'10'.includes(1)`
        // is `true`, so a string would turn off wrappers instead of nothing.
        ...(Array.isArray(message.muted) && message.muted.every((one) => Number.isInteger(one))
          ? { muted: message.muted }
          : {}),
      }
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
    show: (id) => {
      asked = { id, overrides: {} }
      draw(asked)
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
//
// A module may still be loading: the entry hands it over unsettled, since a
// module that never finished kept every story back, measured. It attaches when
// it arrives, at its place in the configuration.
export function createPluginHost(
  loaded: (LoadedPlugin | Promise<LoadedPlugin>)[],
  send: (message: PreviewMessage) => void,
): PluginHost {
  const said = (plugin: string, message: string) => {
    console.error(`crypte: ${plugin}: ${message}`)
    send({ type: 'plugin-error', plugin, message })
  }

  // By place in `plugins`, holes for what is still loading or was refused.
  const plugins: ({ name: string; hooks: PreviewHooks } | undefined)[] = []

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

  const accept = (at: number, one: LoadedPlugin) => {
    if ('error' in one)
      return said(one.name, `its preview module could not load: ${text(one.error)}`)

    // Read inside a `try`: a getter on the export can throw, and the host
    // throwing here would take the whole entry down with it.
    let hooks: PreviewHooks | string
    try {
      hooks = hooksOf(one.module)
    } catch (error) {
      hooks = `its preview module could not be read: ${text(error)}`
    }

    if (typeof hooks === 'string') return said(one.name, hooks)
    plugins[at] = { name: one.name, hooks }

    // Arrived after a render: the story last drawn is not drawn again for it.
    const { afterMount } = hooks
    const story = last
    if (afterMount && story)
      call(one.name, 'afterMount', () => afterMount(contextOf(one.name, story)))
  }

  // How many modules have not arrived: a message no hook receives may be for
  // one of them, and the console says so. Which one is unknown until it arrives.
  let loading = 0

  loaded.forEach((one, at) => {
    if (!(one instanceof Promise)) return accept(at, one)
    loading += 1
    void one.then((settled) => {
      loading -= 1
      accept(at, settled)
    })
  })

  return {
    mounted(story) {
      last = story
      for (const one of plugins) {
        const afterMount = one?.hooks.afterMount
        if (one && afterMount)
          call(one.name, 'afterMount', () => afterMount(contextOf(one.name, story)))
      }
    },
    received(message) {
      const name = message.type.slice(0, message.type.indexOf(':'))
      const onMessage = plugins.find((one) => one?.name === name)?.hooks.onMessage

      if (!onMessage)
        return console.error(
          loading > 0
            ? `crypte: no preview hook receives \`${message.type}\` while a preview module is still loading, and it is dropped`
            : `crypte: no preview hook receives \`${message.type}\``,
        )
      if (!last)
        return console.error(`crypte: \`${message.type}\` arrived before any story rendered`)

      const story = last
      call(name, 'onMessage', () => onMessage(contextOf(name, story), message))
    },
  }
}

// A module's hooks, or why they cannot be used: its default export must be an
// object whose keys are hooks the preview calls, each holding a function or
// left undefined, which the type allows for an optional hook.
function hooksOf(module: unknown): PreviewHooks | string {
  const hooks: unknown = (module as { default?: unknown } | null)?.default

  // Anything exported by name, a hook the preview calls or one of section 7's
  // reserve: never read, so never called, without a word.
  for (const key of typeof module === 'object' && module !== null ? Object.keys(module) : []) {
    if (key !== 'default')
      return `\`${key}\` is exported by name, and the preview reads only the default export`
  }

  if (typeof hooks !== 'object' || hooks === null || Array.isArray(hooks))
    return 'its preview module exports no object of hooks by default'

  for (const [key, value] of Object.entries(hooks)) {
    if (!HOOKS.includes(key))
      return `\`${key}\` is not a hook the preview calls, which are ${HOOKS.join(' and ')}`
    if (value !== undefined && typeof value !== 'function') return `\`${key}\` is not a function`
  }

  return hooks as PreviewHooks
}

// A string, a finite number or a boolean, as an override is (5.1): the rest has
// no field to show it in, and would not survive the JSON round trip of 5.4.
function primitivesOf(props: unknown): RenderedValues {
  if (typeof props !== 'object' || props === null) return {}
  return Object.fromEntries(
    Object.entries(props).filter(
      ([, value]) =>
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)),
    ),
  ) as RenderedValues
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

// What the shell shows for a wrapper: a React component's `displayName` or
// function name, a Vue file's `__name` or its `name` option. A wrapper with none
// is still listed, so its rank stays the one `muted` counts by.
function wrapperName(wrapper: unknown): string {
  return nameOf((wrapper as { component?: unknown } | null)?.component, 0)
}

// `memo(…)` holds its component in `type`, `forwardRef(…)` in `render`: read
// through them, a few levels at most. Only what React marks with `$$typeof`: a Vue
// component carries a `render` of its own, whose name is `render`.
function nameOf(component: unknown, depth: number): string {
  if ((typeof component !== 'object' && typeof component !== 'function') || component === null)
    return 'anonymous'
  for (const key of ['displayName', '__name', 'name']) {
    const value = (component as Record<string, unknown>)[key]
    if (typeof value === 'string' && value !== '') return value
  }
  if (depth > 2 || !('$$typeof' in component)) return 'anonymous'
  const inner =
    (component as { type?: unknown; render?: unknown }).type ??
    (component as { render?: unknown }).render
  return nameOf(inner, depth + 1)
}

// One wrapper and the props it was declared with. `component` stays `unknown`:
// the core knows no framework, so it cannot say this is a component. The adapter
// can, and says it once.
export interface PreviewWrapper {
  component: unknown
  props: Record<string, unknown>
}

// What the preview's entry calls to draw a story, section 1.5 of docs/contracts.md.
// `component` and the wrappers stay `unknown`, as above: each adapter narrows them
// to its framework's components. `mount` is called again on every render, and
// throws what the component threw, which the channel sends as that story's error.
export interface Adapter {
  mount(
    container: HTMLElement,
    component: unknown,
    props: Record<string, unknown>,
    wraps: readonly PreviewWrapper[],
  ): void
  unmount(): void
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
