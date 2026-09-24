// Reading story files, without running them.
//
// `parseSync`, re-exported by Vite from Oxc, so no dependency is added. Not
// `parseAst` beside it: that one reads JavaScript only and fails on `as const`
// and on a generic arrow in `.tsx`.

import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { storyId, type StoryEntry } from '@crypte/core/protocol'
import { parseSync } from 'vite'
import { keyOf, literalOf, propertyOf, wrapperNames, type Node } from './ast'

// The four extensions a project can write, JavaScript included: a project
// without TypeScript writes its stories in `.js`.
export const STORY_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']

// The name a story gets when the file declares none: section 2.2 of contracts.
const ONLY_STORY = 'Default'

// What one story file produced, and why it produced no more. Never fatal: a
// file gives entries and a reason at once rather than losing the catalogue.
export interface StoryFileRead {
  entries: StoryEntry[]
  skipped?: string
  // What the file writes in `details`, which **completes** inference rather than
  // replacing it: section 3.2. Carried apart from the entries because it is an
  // input, per file, while `StoryEntry.details` is the merged result.
  details?: Record<string, unknown>
  // Whether the file meant to be a story: the terminal takes every reason, the
  // shell only the certain ones. Not inferable from the default export's shape.
  meant?: boolean
}

export function entriesOf(file: string, root: string, storiesRoot: string): StoryFileRead {
  const source = readFileSync(file, 'utf8')
  const parsed = parseSync(file, source)

  if (parsed.errors.length > 0) {
    return {
      entries: [],
      skipped: parsed.errors[0]?.message ?? 'the file could not be parsed',
      meant: true,
    }
  }

  const body = parsed.program.body as unknown as Node[]

  // The local name of the import, so `import { defineStories as define }` works
  // and is reported when it fails. Without it, an aliased story produced nothing
  // and said nothing.
  const named = boundTo(parsed.module, 'defineStories') ?? 'defineStories'
  const call = defineStoriesCall(body, named)

  if (!call) {
    // The only sure signal is a call. A file that calls `defineStories` without
    // exporting it by default is a story nobody will find, which is section 2.3.
    //
    // Anything else stays a guess, so it goes to the terminal and not to the
    // shell: a wrapper written `export default memo(Frame)`, a barrel that
    // re-exports `defineStories`, a helper that imports it to wrap it, all read
    // as a story under one shape rule or another. Measured, one counterexample
    // per branch.
    const called = calls(body, named)

    return {
      entries: [],
      skipped: called
        ? 'defineStories is called but not the default export'
        : 'no default export calling defineStories',
      ...(called ? { meant: true } : {}),
    }
  }

  const [target, definition] = call['arguments'] as Node[]
  if (target?.type !== 'Identifier') {
    return { entries: [], skipped: 'the component is not a plain identifier', meant: true }
  }

  const name = target['name'] as string
  const component = componentRef(parsed.module, name)
  if (!component) {
    return {
      entries: [],
      skipped: `${name} is not imported by a form this reader can follow`,
      meant: true,
    }
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

  const detailsNode = propertyOf(definition, 'details')
  const details = shadowed(definition, 'details') ? undefined : record(detailsNode)

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
        component,
        storyFile,
        options: options ?? {},
        details: {},
        props: [...props.keys()].sort(),
        source: callOf(name, props, source),
        ...(meta ? { meta } : {}),
        ...(partial.length > 0 ? { partial: partial.join('; ') } : {}),
      } satisfies StoryEntry
    }),
    ...(details ? { details } : {}),
    ...(reason ? { skipped: reason, meant: true } : {}),
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

// Three answers, not a boolean: only `noBlock` earns the implicit `Default` of
// section 2.2, so a shape this reader cannot read never invents a story.
type StoriesRead =
  | { kind: 'noBlock' }
  | { kind: 'these'; stories: Declared[]; reason?: string }
  | { kind: 'unusable'; reason: string }

// The one place that decides. A fourth kind stops compiling on the `never`
// below.
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

// Whether a spread decides a key's value rather than the file. The **last**
// occurrence, not the first: on `{ props: a, ...base, props: b }` the spread
// precedes the winning value. Key absent, -1, so any spread decides.
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

// The local name an import binds to an exported one, so a helper renamed on
// import is still recognised.
function boundTo(module: unknown, exported: string): string | undefined {
  for (const one of (module as { staticImports: Node[] }).staticImports) {
    for (const entry of one['entries'] as Node[]) {
      const imported = entry['importName'] as Node
      if (imported['kind'] === 'Name' && imported['name'] === exported) {
        return (entry['localName'] as Node)['value'] as string
      }
    }
  }

  return undefined
}

// The imports a story file's `wrap` places as wrappers. Nothing when the file
// is not a story the reader can follow: `crypte check` then reports what it
// reports without it.
export function wrappersOf(file: string): { file: string; export: string }[] {
  let parsed: ReturnType<typeof parseSync>

  try {
    parsed = parseSync(file, readFileSync(file, 'utf8'))
  } catch {
    return []
  }

  const body = parsed.program.body as unknown as Node[]
  const call = defineStoriesCall(body, boundTo(parsed.module, 'defineStories') ?? 'defineStories')
  const definition = (call?.['arguments'] as Node[] | undefined)?.[1]

  return wrapperNames(propertyOf(definition, 'wrap')).flatMap((name) => {
    const found = componentRef(parsed.module, name)
    return found ? [{ file: found.file, export: found.export }] : []
  })
}

// `export default defineStories(…)`, and nothing else. A named export is not a
// story module: section 2.3 of docs/contracts.md.
function defineStoriesCall(body: Node[], name: string): Node | undefined {
  const exported = body.find((node) => node.type === 'ExportDefaultDeclaration')
  const call = exported?.['declaration'] as Node | undefined
  if (call?.type !== 'CallExpression') return undefined

  const callee = call['callee'] as Node
  return callee?.type === 'Identifier' && callee['name'] === name ? call : undefined
}

// Whether the file calls something **at the top level of the module**: a story
// calls it where the module runs, a re-export or a factory body does not.
function calls(body: Node[], name: string): boolean {
  const called = (current: unknown): boolean => {
    if (current === null || typeof current !== 'object') return false

    if (Array.isArray(current)) return current.some((one) => called(one))

    const inner = current as Node

    // A function body is somebody else's code: whatever it calls, it calls when
    // that function runs, not when the module does.
    if (FUNCTIONS_AND_CLASSES.has(inner.type)) return false

    const callee = inner['callee'] as Node | undefined

    if (
      inner.type === 'CallExpression' &&
      callee?.type === 'Identifier' &&
      callee['name'] === name
    ) {
      return true
    }

    return Object.values(inner).some((held) => called(held))
  }

  return called(body)
}

// The nodes whose body runs later, so a call inside one says nothing about what
// the module does.
const FUNCTIONS_AND_CLASSES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassDeclaration',
  'ClassExpression',
])

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

  for (const property of object['properties'] as Node[]) {
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

// The props an object literal writes, in order. A spread or a computed key is
// left out rather than guessed. A value is `undefined` when a later spread may
// replace it: the name is certain, the value is not.
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
  const written = [...props]
    .filter(([prop]) => prop !== 'children')
    .map(([prop, value]) => {
      // A value a spread may replace: the prop is set, its value is unknown, and
      // showing the written one would put in the snippet what the run does not have.
      if (value === undefined) return ''

      const raw = source.slice(value.start, value.end)

      if (value.type === 'Literal' && typeof value['value'] === 'string') {
        // Quoted only when JSX gives back the same string, braces otherwise:
        // see `ATTRIBUTE_HOSTILE`.
        const text = value['value'] as string

        return ATTRIBUTE_HOSTILE.test(text)
          ? ` ${prop}={${JSON.stringify(text)}}`
          : ` ${prop}=${JSON.stringify(text)}`
      }

      // `enabled={true}` is `enabled`, which is how the same prop is written in
      // JSX. `false` has no short form and keeps its braces.
      if (value.type === 'Literal' && value['value'] === true) return ` ${prop}`

      return ` ${prop}={${raw}}`
    })

  const opening = `<${name}${written.join('')}`
  const body = childrenOf(props, source)

  return body === undefined ? `${opening} />` : `${opening}>${body}</${name}>`
}

// What goes between the tags: `children` as an attribute is valid JSX and not
// what anybody writes. `undefined` keeps the self-closing form, including for a
// value a spread may replace, which section 4.2 forbids showing.
function childrenOf(props: Map<string, Node | undefined>, source: string): string | undefined {
  if (!props.has('children')) return undefined

  const value = props.get('children')
  if (value === undefined) return undefined

  // Parentheses survive the parse: a multi-line element is a
  // `ParenthesizedExpression`, not a `JSXElement`.
  const inner = unwrapped(value)
  const raw = source.slice(inner.start, inner.end)

  // An element goes as it is written. Wrapped in braces it would still render,
  // and it is the one form where the braces are plainly not what one writes.
  if (inner.type === 'JSXElement' || inner.type === 'JSXFragment') return raw

  // A string goes bare, which is the whole point, but only when JSX gives back
  // the same string. See `TEXT_HOSTILE`.
  if (inner.type === 'Literal' && typeof inner['value'] === 'string') {
    const text = inner['value'] as string

    return text !== '' && !TEXT_HOSTILE.test(text) ? text : `{${JSON.stringify(text)}}`
  }

  return `{${raw}}`
}

// A node without the parentheses somebody wrote around it, however many.
function unwrapped(node: Node): Node {
  let seen = node

  while (seen.type === 'ParenthesizedExpression') seen = seen['expression'] as Node

  return seen
}

// What JSX would not give back unchanged **between tags**, so what has to keep
// its braces there.
//
// Braces and angle brackets are syntax. `&` opens an entity, measured:
// `Tom &amp; Jerry` copied bare renders `Tom & Jerry`, and `100 &euro;` renders
// `100 €`. The four line terminators fold to one space, `\r` as much as `\n`.
// And edge whitespace is trimmed, so `' a '` would come back as `'a'`.
//
// The rule is one-way on purpose: a string this refuses is merely written with
// braces, which always renders right. A string it wrongly accepts is a snippet
// that lies about what the story shows.
const TEXT_HOSTILE = /[{}<>&\n\r\u2028\u2029\u0000-\u001f]|^\s|\s$/

// The same question **inside a quoted attribute**, where the answer differs. A
// brace, an angle bracket and edge whitespace are all ordinary there; a double
// quote closes the attribute, and `JSON.stringify` escapes it for JavaScript
// rather than for JSX. Measured: `title="a\"b"` is refused by the parser, so
// the copied code does not compile at all. Entities and line terminators behave
// as they do between tags.
//
// The backslash and the control characters belong here too, and only here: a
// JSX attribute literal unescapes nothing, so what `JSON.stringify` escapes for
// JavaScript arrives verbatim. Measured: `C:\\path` came out as an attribute
// the parser accepts and JSX renders with two backslashes, and a tab came out
// as a backslash followed by `t`. Between tags the raw text is emitted, so the
// same characters need no help there.
const ATTRIBUTE_HOSTILE = /["&\\\n\r\u2028\u2029\u0000-\u001f]/

// An object written in the file, read as data. `undefined` when it is not an
// object literal at all, which is what an identifier or a call gives.
function record(node: Node | null | undefined): Record<string, unknown> | undefined {
  if (node?.type !== 'ObjectExpression') return undefined

  const read = literalOf(node)
  return read ? (read.value as Record<string, unknown>) : undefined
}

// Where the component comes from. `undefined` when no import binds the name, or
// binds it as a namespace object, which names no export: the file is skipped.
export function componentRef(module: unknown, name: string) {
  const imports = (module as { staticImports: Node[] }).staticImports

  for (const one of imports) {
    for (const entry of one['entries'] as Node[]) {
      if ((entry['localName'] as Node | undefined)?.['value'] !== name) continue

      const imported = entry['importName'] as Node
      const file = (one['moduleRequest'] as Node)['value'] as string

      if (imported['kind'] === 'Default') return { name, file, export: 'default' }
      if (imported['kind'] === 'Name') {
        return { name, file, export: imported['name'] as string }
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
