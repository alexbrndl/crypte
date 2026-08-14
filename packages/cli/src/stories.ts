// Reading story files, without running them. See docs/internal/architecture.md.

import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { storyId, type StoryEntry } from '@crypte/core/protocol'
import { parseSync } from 'vite'

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

// What one story file produced, and what it could not read. Nothing here is
// ever fatal: one story must not cost the whole catalogue, so a file that
// cannot be read gives no entry and a reason, and a file whose stories are
// only partly readable gives both.
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
  const component = componentRef(parsed.module, name)
  if (!component) {
    return { entries: [], skipped: `${name} is not imported by a form this reader can follow` }
  }

  const path = pathOf(file, storiesRoot)
  const storyFile = posix(relative(root, file))
  const shared = propsOf(propertyOf(definition, 'props'))

  // `meta` travels untouched: section 4.4. `details` does not travel yet, since
  // the manifest carries the resolved form, whose `type` and `required` come
  // from an adapter's inference and not from the file.
  const meta = record(propertyOf(definition, 'meta'))

  // The helper can be imported under another name, and any other call is
  // somebody else's function whose arguments say nothing about props.
  const helper = boundTo(parsed.module, 'story') ?? 'story'
  const named = listed(propertyOf(definition, 'stories'), helper)

  // The single `Default` belongs to a file that names no story, and only to
  // that file: section 2.2. A file whose keys are all unreadable names stories,
  // so falling back here would invent an entry its author never wrote, with an
  // identifier that becomes a URL and a baseline key.
  const stories = named.declares
    ? named.stories
    : [{ name: ONLY_STORY, own: new Map<string, Node>(), options: undefined }]

  return {
    entries: stories.map((story) => {
      const props = new Map([...shared, ...story.own])

      return {
        type: 'story',
        id: storyId(path, story.name),
        path,
        name: story.name,
        component: { ...component },
        storyFile,
        options: record(story.options) ?? {},
        details: {},
        props: [...props.keys()].sort(),
        source: callOf(name, props, source),
        ...(meta ? { meta } : {}),
      } satisfies StoryEntry
    }),
    ...(named.lost.length > 0 ? { skipped: `stories left out: ${named.lost.join(', ')}` } : {}),
  }
}

// The keys a `Story` literal carries, and nothing else: section 2.3.
const STORY_SHAPE = new Set(['props', 'options'])

// The stories the file names, in the order it writes them.
//
// `declares` says whether the file names any story at all, which is not the
// same as producing one: a key computed at runtime and a spread both name
// stories this reader cannot read. Every one of them is counted, because a
// story silently missing from a catalogue looks like a story nobody wrote.
function listed(stories: Node | null, helper: string) {
  const found: { name: string; own: Map<string, Node>; options: Node | undefined }[] = []
  const lost: string[] = []

  if (stories?.type !== 'ObjectExpression') return { stories: found, lost, declares: false }

  const properties = stories['properties'] as Node[]

  for (const property of properties) {
    if (property.type !== 'Property') {
      lost.push('one brought by a spread')
      continue
    }

    // A name is a URL, a baseline key and the anchor of a comment, so a wrong
    // one costs more than a missing one.
    if (property['computed'] === true) {
      lost.push('one whose key is computed at runtime')
      continue
    }

    const value = property['value'] as Node
    found.push({ name: keyOf(property['key'] as Node), ...declaredBy(value, helper) })
  }

  return { stories: found, lost, declares: properties.length > 0 }
}

// Three forms carry the same thing. A bare object is the props. `story(props,
// options)` keeps the two apart. The literal `{ props, options }` is what the
// helper returns, and section 2.3 accepts it written by hand.
function declaredBy(value: Node, helper: string) {
  if (value.type === 'CallExpression') {
    const callee = value['callee'] as Node
    if (callee?.type !== 'Identifier' || callee['name'] !== helper) {
      return { own: new Map<string, Node>(), options: undefined }
    }

    const args = value['arguments'] as Node[]
    return { own: propsOf(args[0] ?? null), options: args[1] }
  }

  const shaped = asStoryLiteral(value)
  if (shaped) return { own: propsOf(shaped.props), options: shaped.options ?? undefined }

  return { own: propsOf(value), options: undefined }
}

// A `Story` written by hand rather than through the helper. Recognised by its
// shape, since nothing else can tell it from a props block: it declares `props`
// and, at most, `options`. A component whose only prop is called `props` is
// therefore read as a `Story`, which is the ambiguity of the union itself.
function asStoryLiteral(value: Node): { props: Node | null; options: Node | null } | undefined {
  if (value.type !== 'ObjectExpression') return undefined

  const properties = value['properties'] as Node[]
  if (properties.length === 0) return undefined

  let declaresProps = false

  for (const property of properties) {
    if (property.type !== 'Property' || property['computed'] === true) return undefined

    const key = keyOf(property['key'] as Node)
    if (!STORY_SHAPE.has(key)) return undefined
    if (key === 'props') declaresProps = true
  }

  return declaresProps
    ? { props: propertyOf(value, 'props'), options: propertyOf(value, 'options') }
    : undefined
}

// The name a non-computed key carries, quoted or bare.
function keyOf(key: Node): string {
  return key.type === 'Identifier' ? (key['name'] as string) : String(key['value'])
}

// The local name an import binds to an exported one, so a helper renamed on
// import is still recognised.
function boundTo(module: unknown, exported: string): string | undefined {
  for (const one of (module as { staticImports?: Node[] })?.staticImports ?? []) {
    for (const entry of (one['entries'] as Node[]) ?? []) {
      const imported = entry['importName'] as Node
      if (imported['kind'] === 'Name' && imported['name'] === exported) {
        return (entry['localName'] as Node)['value'] as string
      }
    }
  }

  return undefined
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

// A key can be quoted, so `{ 'meta': … }` has to be found too. A computed key
// is never a match: nothing says what it holds without running the file.
function propertyOf(object: Node | undefined, name: string): Node | null {
  if (object?.type !== 'ObjectExpression') return null

  const found = (object['properties'] as Node[]).find(
    (property) =>
      property.type === 'Property' &&
      property['computed'] !== true &&
      keyOf(property['key'] as Node) === name,
  )

  return (found?.['value'] as Node | undefined) ?? null
}

// The props an object literal writes, kept in order and paired with their
// value. A spread and a key computed at runtime both carry names we cannot read
// without running the file, so they are left out rather than guessed: a wrong
// name would enter a coverage figure and a prop search.
function propsOf(object: Node | null): Map<string, Node> {
  const props = new Map<string, Node>()
  if (object?.type !== 'ObjectExpression') return props

  for (const property of object['properties'] as Node[]) {
    if (property.type !== 'Property' || property['computed'] === true) continue

    props.set(keyOf(property['key'] as Node), property['value'] as Node)
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
// `undefined` when no import binds it, or when the binding is a namespace
// object, which names no export at all. Both give a file the reader skips: a
// component it cannot place is worse in the manifest than absent from it.
function componentRef(module: unknown, name: string) {
  const imports = (module as { staticImports?: Node[] })?.staticImports ?? []

  for (const one of imports) {
    for (const entry of (one['entries'] as Node[]) ?? []) {
      if ((entry['localName'] as Node | undefined)?.['value'] !== name) continue

      const imported = entry['importName'] as Node
      const file = (one['moduleRequest'] as Node)['value'] as string

      if (imported['kind'] === 'Default') return { name, file, export: 'default' }
      if (imported['kind'] === 'Name') {
        return { name, file, export: (imported['name'] as string) ?? name }
      }

      return undefined
    }
  }

  return undefined
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
