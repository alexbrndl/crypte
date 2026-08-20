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

// What one story file produced, and why it produced no more. Nothing here is
// ever fatal: one story must not cost the whole catalogue. A file may give no
// entry and a reason, entries and a reason, or entries alone. The reason covers
// what could not be read and what the file simply does not name.
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

  const body = parsed.program.body as unknown as Node[]
  const call = defineStoriesCall(body)

  if (!call) {
    // Said only for a file that meant to be a story. Two signals, because one
    // alone missed a case each way, measured:
    //
    // - it names `defineStories`, so `export const stories = defineStories(A)`
    //   is a story nobody will find rather than a helper (section 2.3) ;
    // - or its default export is not a component, so `export default 12` is a
    //   story an edit broke, the silence lot 4 closed.
    //
    // A file exporting a component by default is a wrapper posed next to the
    // stories, and a permanent line for it would train the reader to ignore the
    // banner. Same for a helper, a barrel or a type file, which export no
    // default at all.
    if (mentions(body, 'defineStories')) {
      return { entries: [], skipped: 'defineStories is called but not the default export' }
    }

    const exported = body.find((node) => node.type === 'ExportDefaultDeclaration')
    if (exported === undefined || component_(exported['declaration'] as Node | undefined)) {
      return { entries: [] }
    }

    return { entries: [], skipped: 'its default export is not a defineStories call' }
  }

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

  // Read only what a spread does not decide, the same rule the stories follow.
  const sharedProps = propertyOf(definition, 'props')
  const shared = shadowed(definition, 'props') ? new Map<string, Node>() : propsOf(sharedProps)

  // `meta` travels untouched: section 4.4. `details` does not travel yet, since
  // the manifest carries the resolved form, whose `type` and `required` come
  // from an adapter's inference and not from the file.
  const metaNode = propertyOf(definition, 'meta')
  const meta = shadowed(definition, 'meta') ? undefined : record(metaNode)

  // What the file lost above its stories, so every entry of the file says it.
  // Three losses were silent: a spread deciding the shared block, a spread
  // deciding `meta`, and what the shared block itself could not give up.
  const above = [
    ...(shadowed(definition, 'props')
      ? ['a spread in the definition decides the props, so the shared block is not read']
      : unreadOf(sharedProps, source)),
    ...(shadowed(definition, 'meta')
      ? ['a spread in the definition decides `meta`, so no status or owner is read']
      : metaNode !== null && meta === undefined
        ? ['`meta` holds a value this reader cannot read, so no status or owner is read']
        : []),
  ]

  // The helper can be imported under another name, and any other call is
  // somebody else's function whose arguments say nothing about props.
  const helper = boundTo(parsed.module, 'story') ?? 'story'
  const { stories, reason } = produced(readStories(definition, helper, source))

  return {
    entries: stories.map((story) => {
      const props = new Map([...shared, ...story.own])
      const options = record(story.options)
      const partial = [
        ...new Set([
          ...above,
          ...story.unread,
          ...(story.options !== undefined && options === undefined
            ? ['`options` holds a value this reader cannot read, so none of it is read']
            : []),
        ]),
      ]

      return {
        type: 'story',
        id: storyId(path, story.name),
        path,
        name: story.name,
        component: { ...component },
        storyFile,
        options: options ?? {},
        details: {},
        props: [...props.keys()].sort(),
        source: callOf(name, props, source),
        ...(meta ? { meta } : {}),
        ...(partial.length > 0 ? { partial: partial.join('; ') } : {}),
      } satisfies StoryEntry
    }),
    ...(reason ? { skipped: reason } : {}),
  }
}

// The keys a `Story` literal carries, and nothing else: section 2.3.
const STORY_SHAPE = new Set(['props', 'options'])

interface Declared {
  name: string
  // A value is `undefined` when a spread of the same object may replace it: the
  // name is certain, the value is not. See `propsOf`.
  own: Map<string, Node | undefined>
  options: Node | undefined
  // What its own props block did not give up. See `unreadOf`.
  unread: string[]
}

// What a file says about its stories. Three answers, never two: this reader can
// also fail to know, and that answer is the one four review rounds kept losing.
//
// `noBlock` is the only one that earns the single `Default` of section 2.2.
// Squeezed into a boolean, every shape it could not read fell on that side and
// invented a story its author never wrote, with an identifier that becomes a
// URL and a baseline key. Here a new shape has to pick one of the three.
type StoriesRead =
  | { kind: 'noBlock' }
  | { kind: 'these'; stories: Declared[]; reason?: string }
  | { kind: 'unusable'; reason: string }

// The one place that decides. A fourth kind stops compiling on the `never`
// below. See docs/internal/architecture.md.
function produced(read: StoriesRead): { stories: Declared[]; reason?: string } {
  switch (read.kind) {
    case 'noBlock':
      return { stories: [{ name: ONLY_STORY, own: new Map(), options: undefined, unread: [] }] }
    case 'these':
      return { stories: read.stories, reason: read.reason }
    case 'unusable':
      return { stories: [], reason: read.reason }
    // The throw is for a cast that gets one past the compiler: returning `read`
    // would hand back a shape the caller does not expect.
    default: {
      const unhandled: never = read

      throw new Error(`unread story shape: ${JSON.stringify(unhandled)}`)
    }
  }
}

// The stories the file names, in the order it writes them.
function readStories(definition: Node | undefined, helper: string, source: string): StoriesRead {
  // The definition first: `defineStories(A, config)` holds nothing this reader
  // can follow, so the absence of a block below would prove nothing.
  if (definition !== undefined && definition.type !== 'ObjectExpression') {
    return { kind: 'unusable', reason: 'the definition is not an object literal' }
  }

  // A spread does not only add a key, it replaces one already written when it
  // comes after it. Measured: `{ stories: written, ...base }` gives base's.
  // So `defineStories(A, { ...base })` may name ten stories, and
  // `defineStories(A, { stories: …, ...base })` hands the answer to `base`.
  if (shadowed(definition, 'stories')) {
    return { kind: 'unusable', reason: 'a spread in the definition decides the stories' }
  }

  const block = propertyOf(definition, 'stories')
  if (block === null) return { kind: 'noBlock' }

  // `stories: shared` is allowed by section 2.3, and holds names only the
  // running file would know.
  if (block.type !== 'ObjectExpression') {
    return { kind: 'unusable', reason: 'the stories block is not an object literal' }
  }

  // Readable, and it names nothing. Not a failure to read, so the reason says
  // so: an author who writes `stories: {}` gets no entry and knows why.
  const properties = block['properties'] as Node[]
  if (properties.length === 0) {
    return { kind: 'unusable', reason: 'the stories block names no story' }
  }

  // The same rule one level down: a spread replaces the keys it follows, so
  // nothing written before the last one can be trusted.
  const lastSpread = properties.findLastIndex((property) => property.type !== 'Property')

  // Keyed by name so a name written twice keeps its last value, the way the
  // object literal does. A Map keeps the first position, as the literal does.
  const named = new Map<string, Declared>()
  const lost: string[] = []

  for (const [index, property] of properties.entries()) {
    if (property.type !== 'Property') {
      lost.push('one brought by a spread')
      continue
    }

    if (index < lastSpread) {
      lost.push('one a later spread may replace')
      continue
    }

    // A name is a URL, a baseline key and the anchor of a comment, so a wrong
    // one costs more than a missing one.
    if (property['computed'] === true) {
      lost.push('one whose key is computed at runtime')
      continue
    }

    const name = keyOf(property['key'] as Node)
    named.set(name, { name, ...declaredBy(property['value'] as Node, helper, source) })
  }

  const stories = [...named.values()]

  if (stories.length === 0) {
    return { kind: 'unusable', reason: `no story this reader can name: ${lost.join(', ')}` }
  }

  return {
    kind: 'these',
    stories,
    ...(lost.length > 0 ? { reason: `stories left out: ${lost.join(', ')}` } : {}),
  }
}

// Three forms carry the same thing. A bare object is the props. `story(props,
// options)` keeps the two apart. The literal `{ props, options }` is what the
// helper returns, and section 2.3 accepts it written by hand.
function declaredBy(value: Node, helper: string, source: string) {
  if (value.type === 'CallExpression') {
    const callee = value['callee'] as Node
    if (callee?.type !== 'Identifier' || callee['name'] !== helper) {
      return {
        own: new Map<string, Node | undefined>(),
        options: undefined,
        unread: unreadOf(value, source),
      }
    }

    const args = value['arguments'] as Node[]
    const own = args[0] ?? null
    return { own: propsOf(own), options: args[1], unread: unreadOf(own, source) }
  }

  const shaped = asStoryLiteral(value)
  if (shaped) {
    return {
      own: propsOf(shaped.props),
      options: shaped.options ?? undefined,
      unread: unreadOf(shaped.props, source),
    }
  }

  return { own: propsOf(value), options: undefined, unread: unreadOf(value, source) }
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

// Whether a spread decides the value of a key rather than the file. True when a
// spread follows the key, and true for any spread when the key is absent, since
// `findLastIndex` gives -1 and every position is then after it.
//
// The **last** occurrence, the one `propertyOf` reads: on
// `{ props: a, ...base, props: b }` the spread precedes the value that wins, so
// it decides nothing.
function shadowed(object: Node | undefined, name: string): boolean {
  if (object?.type !== 'ObjectExpression') return false

  const properties = object['properties'] as Node[]
  const at = properties.findLastIndex(
    (property) =>
      property.type === 'Property' &&
      property['computed'] !== true &&
      keyOf(property['key'] as Node) === name,
  )

  return properties.some((property, index) => property.type !== 'Property' && index > at)
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

// A function or a class, which is what a wrapper posed next to the stories
// exports. Anything else in that place is a story the reader could not use.
function component_(node: Node | undefined): boolean {
  return (
    node !== undefined &&
    [
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
      'ClassDeclaration',
      'ClassExpression',
    ].includes(node.type)
  )
}

// Whether the file names something at all, anywhere. Read from the tree rather
// than the text: a name in a comment or a string is not a call.
function mentions(body: Node[], name: string): boolean {
  const walk = (current: unknown): boolean => {
    if (current === null || typeof current !== 'object') return false

    if (Array.isArray(current)) return current.some((one) => walk(one))

    const inner = current as Node
    if (inner.type === 'Identifier' && inner['name'] === name) return true

    return Object.values(inner).some((held) => walk(held))
  }

  return walk(body)
}

// A key can be quoted, so `{ 'meta': … }` has to be found too. A computed key
// is never a match: nothing says what it holds without running the file.
function propertyOf(object: Node | undefined, name: string): Node | null {
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

// What an object literal did not give up. A spread's names and a computed key
// cannot be read without running the file, so the note quotes what the file
// wrote: the missing names are precisely what nobody can read.
function unreadOf(object: Node | null | undefined, source: string): string[] {
  // Absent, nothing to say. Present without being a literal, everything is lost,
  // which is the largest silent loss of them all: `props: shared` is legal by
  // section 2.3, and gave an empty table that read as a complete one.
  if (object === null || object === undefined) return []

  if (object.type !== 'ObjectExpression') {
    return [
      `\`${written(source, object)}\` is not written inline, so the props it holds are not read`,
    ]
  }

  const notes = new Set<string>()

  for (const property of (object['properties'] as Node[]) ?? []) {
    if (property.type !== 'Property') {
      notes.add(`\`${written(source, property)}\` brings props this reader cannot follow`)
      continue
    }

    if (property['computed'] === true)
      notes.add('a prop whose key is computed at runtime is left out')
  }

  return [...notes]
}

// Pinned to a locale, like the sort in `manifest.ts`: this note travels in the
// manifest and in the committed fingerprint, so two machines must cut the same.
const GRAPHEMES = new Intl.Segmenter('en')

// What the file wrote, on one line and short enough for a list item or a
// terminal line: a spread can span ten lines, and its own text is the message.
function written(source: string, node: Node): string {
  const one = source.slice(node.start, node.end).replace(/\s+/gu, ' ')

  // By graphemes, not by UTF-16 units: cutting inside a surrogate pair sent half
  // a character into the manifest, and cutting inside a composed emoji would
  // break it in two.
  const signes = [...GRAPHEMES.segment(one)].map((un) => un.segment)

  return signes.length > 40 ? `${signes.slice(0, 39).join('')}…` : one
}

// The props an object literal writes, kept in order and paired with their value.
// A spread and a key computed at runtime both carry names we cannot read without
// running the file, so they are left out rather than guessed: a wrong name would
// enter a coverage figure and a prop search.
//
// A value is `undefined` when a spread of the same object follows it. The name is
// certain, since the literal sets it whatever the spread holds, but the value is
// not, so it is left out of the call code rather than shown wrong.
function propsOf(object: Node | null): Map<string, Node | undefined> {
  const props = new Map<string, Node | undefined>()
  if (object?.type !== 'ObjectExpression') return props

  const properties = object['properties'] as Node[]
  const lastSpread = properties.findLastIndex((property) => property.type !== 'Property')

  for (const [index, property] of properties.entries()) {
    if (property.type !== 'Property' || property['computed'] === true) continue

    const value = index < lastSpread ? undefined : (property['value'] as Node)
    props.set(keyOf(property['key'] as Node), value)
  }

  return props
}

// The call the user would have written by hand, rebuilt from their own text so
// that an expression we cannot evaluate still reads as they wrote it.
function callOf(name: string, props: Map<string, Node | undefined>, source: string): string {
  const written = [...props].map(([prop, value]) => {
    // A value a spread may replace: the prop is set, its value is unknown, and
    // showing the written one would put in the snippet what the run does not have.
    if (value === undefined) return ''

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

// Shared with `manifest.ts`: the two produced the same string by two different
// rules, and the shell compares `skipped[].file` with `entry.storyFile`.
export function posix(path: string): string {
  return path.split(sep).join('/')
}
