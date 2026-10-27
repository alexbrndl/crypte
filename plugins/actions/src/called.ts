// What the preview sends the panel at each call: the arguments as text, since
// an event or a component instance would not survive `postMessage`.
export type Called = {
  type: 'actions:called'
  id: string
  prop: string
  args: string[]
}

// An argument as a reader recognises it: a value as written, an event by its
// kind, anything else by its constructor. Short, since a row holds it.
export function summaryOf(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'function') return `function ${value.name || '(anonymous)'}`
  if (typeof value !== 'object' || value === null) return String(value)

  // Read by shape rather than `instanceof`: the event comes from the iframe's
  // own `Event`, which a test or another realm does not share.
  // React hands its own wrapper, whose name says nothing to a reader: the
  // browser's event it carries is named instead.
  const { nativeEvent } = value as { nativeEvent?: unknown }
  if (typeof nativeEvent === 'object' && nativeEvent !== null) return summaryOf(nativeEvent)

  const named = value.constructor?.name ?? 'Object'
  const { type } = value as { type?: unknown }
  if ('target' in value && typeof type === 'string') return `${named} ${type}`
  if (Array.isArray(value)) return `Array(${value.length})`
  if (named !== 'Object') return named

  try {
    const text = JSON.stringify(value)
    return text.length > 80 ? `${text.slice(0, 79)}…` : text
  } catch {
    return 'Object'
  }
}
