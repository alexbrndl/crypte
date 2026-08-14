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

  const declared = listed(propertyOf(definition, 'stories'), source)
  const stories =
    declared.length > 0 ? declared : [{ name: ONLY_STORY, own: new Map<string, Node>() }]

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
        options: {},
        details: {},
        props: [...props.keys()].sort(),
        source: callOf(name, props, source),
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
      // call. The helper belongs to the adapter, and only its first argument
      // holds props.
      const own =
        value.type === 'CallExpression' ? ((value['arguments'] as Node[])[0] ?? null) : value

      return { name: nameOf(key, source), own: propsOf(own) }
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
