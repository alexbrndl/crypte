// Reading story files, without running them. See docs/internal/architecture.md.

import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { storyId, type StoryEntry } from '@crypte/core/protocol'
import { parseSync } from 'vite'
import { ConfigError } from './errors'

// The four extensions a project can write. A project without TypeScript writes
// its stories in JavaScript: see docs/decisions.md.
export const STORY_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']

// The name a story gets when the file declares none: section 2.2 of contracts.
const ONLY_STORY = 'Default'

interface Node {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

// What one story file produced, or the reason it produced nothing. A broken
// file is skipped, never fatal: one story must not cost the whole catalogue.
export interface StoryFileRead {
  entries: StoryEntry[]
  skipped?: string
}

export function entriesOf(file: string, root: string, storiesRoot: string): StoryFileRead {
  const source = readFileSync(file, 'utf8')
  const parsed = parseSync(file, source)

  if (parsed.errors.length > 0) {
    return { entries: [], skipped: parsed.errors[0]?.message ?? 'the file could not be parsed' }
  }

  const call = defineStoriesCall(parsed.program.body as unknown as Node[])
  if (!call) return { entries: [], skipped: 'no default export calling defineStories' }

  const [target, definition] = (call['arguments'] as Node[]) ?? []
  if (target?.type !== 'Identifier') {
    return { entries: [], skipped: 'the component is not a plain identifier' }
  }

  const name = target['name'] as string
  const path = pathOf(file, storiesRoot)
  const component = componentRef(parsed.module, name, root, file)
  const storyFile = posix(relative(root, file))
  const shared = propsOf(propertyOf(definition, 'props'))

  // `meta` travels untouched: section 4.4. `details` does not travel yet, since
  // the manifest carries the resolved form, whose `type` and `required` come
  // from an adapter's inference and not from the file.
  const meta = record(propertyOf(definition, 'meta'))

  const declared = listed(propertyOf(definition, 'stories'), source)
  const stories =
    declared.length > 0
      ? declared
      : [{ name: ONLY_STORY, own: new Map<string, Node>(), options: undefined }]

  return {
    entries: stories.map((story) => {
      const props = new Map([...shared, ...story.own])

      return {
        type: 'story',
        id: storyId(path, story.name),
        path,
        name: story.name,
        component,
        storyFile,
        options: record(story.options) ?? {},
        details: {},
        props: [...props.keys()].sort(),
        source: callOf(name, props, source),
        ...(meta ? { meta } : {}),
      } satisfies StoryEntry
    }),
  }
}

// The stories the file names, in the order it writes them.
function listed(stories: Node | null, source: string) {
  if (stories?.type !== 'ObjectExpression') return []

  return (stories['properties'] as Node[])
    .filter((property) => property.type === 'Property')
    .map((property) => {
      const key = property['key'] as Node
      const value = property['value'] as Node

      // A story is either a bare props object or a `story(props, options)`
      // call. The helper belongs to the adapter: its first argument holds the
      // props, its second the options, which travel untouched.
      const call = value.type === 'CallExpression' ? (value['arguments'] as Node[]) : undefined
      const own = call ? (call[0] ?? null) : value

      return { name: nameOf(key, source), own: propsOf(own), options: call?.[1] }
    })
}

// A key is a quoted string, a bare identifier, or something computed we cannot
// read without running the file. The last case keeps its own text.
function nameOf(key: Node, source: string): string {
  if (key.type === 'Literal') return String(key['value'])
  if (key.type === 'Identifier') return key['name'] as string

  return source.slice(key.start, key.end)
}

// `export default defineStories(…)`, and nothing else. A named export is not a
// story module: section 2.3 of docs/contracts.md.
function defineStoriesCall(body: Node[]): Node | undefined {
  const exported = body.find((node) => node.type === 'ExportDefaultDeclaration')
  const call = exported?.['declaration'] as Node | undefined
  if (call?.type !== 'CallExpression') return undefined

  const callee = call['callee'] as Node
  return callee?.type === 'Identifier' && callee['name'] === 'defineStories' ? call : undefined
}

function propertyOf(object: Node | undefined, name: string): Node | null {
  if (object?.type !== 'ObjectExpression') return null

  const found = (object['properties'] as Node[]).find(
    (property) =>
      property.type === 'Property' && (property['key'] as Node | undefined)?.['name'] === name,
  )

  return (found?.['value'] as Node | undefined) ?? null
}

// The props an object literal writes, kept in order and paired with their
// value. A spread carries names we cannot read without running the file, so it
// is left out rather than guessed.
function propsOf(object: Node | null): Map<string, Node> {
  const props = new Map<string, Node>()
  if (object?.type !== 'ObjectExpression') return props

  for (const property of object['properties'] as Node[]) {
    if (property.type !== 'Property') continue

    const key = property['key'] as Node
    const name = key.type === 'Identifier' ? (key['name'] as string) : String(key['value'])
    props.set(name, property['value'] as Node)
  }

  return props
}

// The call the user would have written by hand, rebuilt from their own text so
// that an expression we cannot evaluate still reads as they wrote it.
function callOf(name: string, props: Map<string, Node>, source: string): string {
  const written = [...props].map(([prop, value]) => {
    const raw = source.slice(value.start, value.end)

    if (value.type === 'Literal' && typeof value['value'] === 'string') {
      return ` ${prop}=${JSON.stringify(value['value'])}`
    }

    // `enabled={true}` is `enabled`, which is how the same prop is written in
    // JSX. `false` has no short form and keeps its braces.
    if (value.type === 'Literal' && value['value'] === true) return ` ${prop}`

    return ` ${prop}={${raw}}`
  })

  return `<${name}${written.join('')} />`
}

// An object written in the file, read as data. `undefined` when it is not an
// object literal at all, which is what an identifier or a call gives.
function record(node: Node | null | undefined): Record<string, unknown> | undefined {
  if (node?.type !== 'ObjectExpression') return undefined

  const read = literalOf(node)
  return read ? (read.value as Record<string, unknown>) : undefined
}

// The value an expression writes, when it is one JSON can hold. Anything else
// gives `undefined`, and the key that carried it is left out rather than
// guessed: section 4.5 promises that everything in the manifest survives a JSON
// round trip, and `JSON.stringify` drops what it cannot represent in silence.
//
// Wrapped in an object so that a literal `null` and "not a literal" stay apart.
function literalOf(node: Node | null | undefined): { value: unknown } | undefined {
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

        value[key.type === 'Identifier' ? (key['name'] as string) : String(key['value'])] =
          read.value
      }

      return { value }
    }

    default:
      return undefined
  }
}

// Where the component comes from, read from the import that binds its name.
function componentRef(module: unknown, name: string, root: string, file: string) {
  const imports = (module as { staticImports?: Node[] })?.staticImports ?? []

  for (const one of imports) {
    for (const entry of (one['entries'] as Node[]) ?? []) {
      if ((entry['localName'] as Node | undefined)?.['value'] !== name) continue

      const imported = entry['importName'] as Node
      return {
        name,
        file: (one['moduleRequest'] as Node)['value'] as string,
        export: imported['kind'] === 'Default' ? 'default' : ((imported['name'] as string) ?? name),
      }
    }
  }

  throw new ConfigError(`${posix(relative(root, file))} uses ${name} without importing it.`)
}

// The tree comes from the path, with no title declared anywhere: section 1.1.
function pathOf(file: string, storiesRoot: string): string[] {
  const parts = posix(relative(storiesRoot, file)).split('/')
  const last = parts.pop() ?? ''

  return [...parts, last.replace(/\.[jt]sx?$/, '')]
}

function posix(path: string): string {
  return path.split(sep).join('/')
}
