// What an object literal gives up when its text is read rather than run.
// One reader for the whole CLI, a second copy drifts: see docs/internal/comprendre.md.

export interface Node {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

// The name a non-computed key carries, quoted or bare.
export function keyOf(key: Node): string {
  return key.type === 'Identifier' ? (key['name'] as string) : String(key['value'])
}

// A key can be quoted, so `{ 'meta': … }` has to be found too. A computed key
// is never a match: nothing says what it holds without running the file.
export function propertyOf(object: Node | undefined, name: string): Node | null {
  if (object?.type !== 'ObjectExpression') return null

  // The last one, not the first: a key written twice keeps its last value at
  // runtime, and `find` would read the one the file discards.
  const found = (object['properties'] as Node[]).findLast(
    (property) =>
      property.type === 'Property' &&
      property['computed'] !== true &&
      keyOf(property['key'] as Node) === name,
  )

  return (found?.['value'] as Node | undefined) ?? null
}

// The value an expression writes, when JSON can hold it. Anything else gives
// `undefined` and its key is left out: section 4.5 promises a manifest that
// survives a JSON round trip. Wrapped so literal `null` and "not a literal" differ.
export function literalOf(node: Node | null | undefined): { value: unknown } | undefined {
  if (!node) return undefined

  switch (node.type) {
    case 'Literal': {
      // A regular expression is a `Literal` too, and it does not survive JSON.
      if ('regex' in node) return undefined
      const value = node['value']
      return typeof value === 'bigint' ? undefined : { value }
    }

    // `` `stable` `` is written by nobody, but `${}`-free templates cost one line.
    case 'TemplateLiteral': {
      const parts = node['quasis'] as Node[]
      if ((node['expressions'] as Node[]).length > 0 || parts.length !== 1) return undefined
      return { value: (parts[0]?.['value'] as { cooked?: string })?.cooked ?? '' }
    }

    // `-1` is a unary expression, not a negative literal.
    case 'UnaryExpression': {
      if (node['operator'] !== '-') return undefined
      const inner = literalOf(node['argument'] as Node)
      return typeof inner?.value === 'number' ? { value: -inner.value } : undefined
    }

    case 'ArrayExpression': {
      const values: unknown[] = []

      // One unreadable element drops the whole array. Skipping it would shift
      // every index after it, which changes the data instead of losing it.
      for (const element of node['elements'] as (Node | null)[]) {
        const read = literalOf(element)
        if (!read) return undefined
        values.push(read.value)
      }

      return { value: values }
    }

    case 'ObjectExpression': {
      const value: Record<string, unknown> = {}

      for (const property of node['properties'] as Node[]) {
        // A spread, a method, or a computed key: none of them can be read
        // without running the file.
        if (property.type !== 'Property' || property['computed'] === true) return undefined

        const key = property['key'] as Node
        const read = literalOf(property['value'] as Node)
        if (!read) return undefined

        value[keyOf(key)] = read.value
      }

      return { value }
    }

    default:
      return undefined
  }
}
