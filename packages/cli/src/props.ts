// What a component file declares about its props, read without running it.
// See section 3.2 of docs/contracts.md.

import { readFileSync } from 'node:fs'
import type { PropKind, ResolvedPropDetails } from '@crypte/core/protocol'
import { parseSync } from 'vite'
import { literalOf, type Node } from './stories'

interface Comment {
  type: string
  value: string
  start: number
  end: number
}

// Nothing here is ever fatal. A file that does not parse, a component that is not
// found, a type that says nothing: each gives fewer props, never an error, and
// the story renders either way. Section 8 of docs/contracts.md.
export function detailsOf(file: string, exported: string): Record<string, ResolvedPropDetails> {
  let source: string
  let parsed: ReturnType<typeof parseSync>

  try {
    source = readFileSync(file, 'utf8')
    parsed = parseSync(file, source)
  } catch {
    return {}
  }

  if (parsed.errors.length > 0) return {}

  const body = parsed.program.body as unknown as Node[]
  const comments = parsed.comments as unknown as Comment[]
  const parameter = firstParameter(body, exported)
  if (!parameter) return {}

  // The declared type first, the destructuring pattern second. A type nobody can
  // resolve, `ComponentProps<'span'>` for one, leaves only what the file wrote
  // by hand: enumerating what it holds would need the type checker, and inventing
  // names is what section 4.2 forbids.
  const members = membersOf(body, parameter)
  const defaults = defaultsOf(parameter)
  const named = members ?? destructured(parameter)

  const details: Record<string, ResolvedPropDetails> = {}

  for (const { name, optional, annotation, at } of named) {
    const described = describe(source, comments, at)
    const kind = annotation ? kindOf(annotation) : { type: 'unknown' as PropKind }
    const fallback = defaults.values[name]

    details[name] = {
      ...kind,
      // A default makes a prop optional for whoever calls the component, even
      // one the type declares required, and even one whose value cannot be read.
      required: !optional && !defaults.named.has(name),
      ...(described === undefined ? {} : { description: described }),
      ...(fallback === undefined ? {} : { default: fallback }),
    }
  }

  return details
}

interface Member {
  name: string
  optional: boolean
  annotation: Node | undefined
  // Where the member starts, so the comment that precedes it can be found.
  at: number
}

// The first parameter of the exported component, whatever shape declares it.
function firstParameter(body: Node[], exported: string): Node | undefined {
  // `export default Badge` names a declaration further up rather than carrying
  // one. Following the name once covers the common shape; `export default
  // memo(Badge)` is a call and is not followed, which
  // `docs/internal/suivi.md` records.
  const named =
    exported === 'default'
      ? body
          .filter((node) => node.type === 'ExportDefaultDeclaration')
          .map((node) => (node['declaration'] as Node | null)?.['name'])
          .find((one): one is string => typeof one === 'string')
      : undefined

  return parameterOf(body, named ?? exported) ?? (named ? undefined : parameterOf(body, exported))
}

function parameterOf(body: Node[], exported: string): Node | undefined {
  for (const node of body) {
    const declaration = (node['declaration'] ?? node) as Node | null
    if (!declaration) continue

    if (declaration.type === 'FunctionDeclaration') {
      const name = (declaration['id'] as Node | null)?.['name']
      if (name === exported || (exported === 'default' && node.type === 'ExportDefaultDeclaration'))
        return (declaration['params'] as Node[])[0]
    }

    if (declaration.type === 'VariableDeclaration') {
      for (const one of declaration['declarations'] as Node[]) {
        const name = (one['id'] as Node | null)?.['name']
        const init = one['init'] as Node | null
        if (name !== exported || !init) continue
        if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
          return (init['params'] as Node[])[0]
      }
    }
  }

  return undefined
}

// The members of the parameter's declared type, or nothing when no type says.
// A named type is looked up in the same file only: following an import is a
// resolver's job, and this runs before any server exists.
function membersOf(body: Node[], parameter: Node): Member[] | undefined {
  const annotation = (parameter['typeAnnotation'] as Node | null)?.['typeAnnotation'] as
    | Node
    | undefined
  if (!annotation) return undefined

  const literal = annotation.type === 'TSTypeLiteral' ? annotation : namedType(body, annotation)

  return literal ? signatures(literal) : undefined
}

// The declaration a type reference points at, when this file holds it.
function namedType(body: Node[], annotation: Node): Node | undefined {
  if (annotation.type !== 'TSTypeReference') return undefined

  const name = (annotation['typeName'] as Node | null)?.['name']
  if (typeof name !== 'string') return undefined

  for (const node of body) {
    const declaration = (node['declaration'] ?? node) as Node | null
    if (!declaration) continue

    const declared = (declaration['id'] as Node | null)?.['name']
    if (declared !== name) continue

    if (declaration.type === 'TSInterfaceDeclaration') return declaration['body'] as Node
    if (declaration.type === 'TSTypeAliasDeclaration') {
      const aliased = declaration['typeAnnotation'] as Node
      if (aliased.type === 'TSTypeLiteral') return aliased
    }
  }

  return undefined
}

// The name a key writes, or nothing when nobody can read it without running the
// file. An identifier writes itself and a string literal writes its own text, so
// `'aria-label'` is a prop name like any other. A computed key is not: section
// 4.2 says its name cannot be read and that guessing would put a wrong one in.
function nameOf(key: Node | null | undefined, computed: boolean): string | undefined {
  if (!key || computed) return undefined
  if (key.type === 'Identifier') return String(key['name'])

  const written = key.type === 'Literal' ? key['value'] : undefined

  return typeof written === 'string' && written !== '' ? written : undefined
}

// `TSPropertySignature` entries of an interface body or a type literal, which
// hold their members under the same key.
function signatures(literal: Node): Member[] {
  const found = (literal['body'] ?? literal['members']) as Node[] | undefined

  return (found ?? [])
    .filter((one) => one.type === 'TSPropertySignature')
    .flatMap((one) => {
      const name = nameOf(one['key'] as Node, one['computed'] === true)
      if (name === undefined) return []

      return [
        {
          name,
          optional: one['optional'] === true,
          annotation: (one['typeAnnotation'] as Node | null)?.['typeAnnotation'] as
            | Node
            | undefined,
          at: one.start,
        },
      ]
    })
}

// The names a destructuring pattern writes. A rest element is the pass-through
// itself, so it names nothing: what it holds is only in the type it came from.
function destructured(parameter: Node): Member[] {
  if (parameter.type !== 'ObjectPattern') return []

  return (parameter['properties'] as Node[])
    .filter((one) => one.type === 'Property')
    .flatMap((one) => {
      const name = nameOf(one['key'] as Node, one['computed'] === true)
      if (name === undefined) return []

      // A pattern says nothing about optionality. A default value does, and
      // `defaultsOf` is what reads it.
      return [{ name, optional: true, annotation: undefined, at: one.start }]
    })
}

// Which props a pattern gives a default, and which of those defaults can be
// written down. The two are not the same: `{ tone = compute() }` has a default,
// so the prop is optional, but section 4.5 asks the CLI to guarantee what it
// writes and a computed value does not survive JSON. So the name is kept and the
// value is not.
function defaultsOf(parameter: Node): { named: Set<string>; values: Record<string, unknown> } {
  const named = new Set<string>()
  const values: Record<string, unknown> = {}

  if (parameter.type !== 'ObjectPattern') return { named, values }

  for (const one of parameter['properties'] as Node[]) {
    if (one.type !== 'Property') continue

    const value = one['value'] as Node
    if (value.type !== 'AssignmentPattern') continue

    const name = nameOf(one['key'] as Node, one['computed'] === true)
    if (name === undefined) continue
    named.add(name)

    // `literalOf` and not `type === 'Literal'`: a bigint and a regular
    // expression are `Literal` nodes too, and writing either one made
    // `JSON.stringify` throw, which cost the whole manifest and the fingerprint
    // with it. Measured. The rules live in `stories.ts`, once.
    const read = literalOf(value['right'] as Node)
    if (read) values[name] = read.value
  }

  return { named, values }
}

// The block comment that ends just before a member, its JSDoc stars and margin
// removed. Anything further up belongs to something else.
function describe(source: string, comments: Comment[], at: number): string | undefined {
  // JSDoc only, which is what section 3.1 promises. A `//` at the end of the
  // previous member's line passed the whitespace check below and became this
  // member's description; a `/* eslint-disable-next-line */` became a published
  // one. Both measured.
  const found = comments
    .filter((one) => one.end <= at && one.type === 'Block' && one.value.startsWith('*'))
    .at(-1)
  if (!found) return undefined

  // Only whitespace between the two, or the comment documents a neighbour and
  // this member has none. Without the check, the second member of an interface
  // inherited the first one's description.
  if (source.slice(found.end, at).trim() !== '') return undefined

  const text = found.value
    .replace(/^\*/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, '').trimEnd())
    .join(' ')
    .trim()

  return text === '' ? undefined : text
}

// A node the type checker would call something. Read from the syntax alone, so
// what a name points at is out of reach: an unresolved reference is `unknown`
// rather than `object`, which would claim more than the file says.
const NODES = new Set(['ReactNode', 'ReactElement', 'Element', 'JSX.Element'])

function kindOf(annotation: Node): { type: PropKind; options?: unknown[] } {
  switch (annotation.type) {
    case 'TSStringKeyword':
      return { type: 'string' }
    case 'TSNumberKeyword':
      return { type: 'number' }
    case 'TSBooleanKeyword':
      return { type: 'boolean' }
    case 'TSFunctionType':
      return { type: 'function' }
    case 'TSArrayType':
      return { type: 'array' }
    case 'TSTypeLiteral':
      return { type: 'object' }
    case 'TSUnionType':
      return union(annotation)
    case 'TSTypeReference':
      return reference(annotation)
    default:
      return { type: 'unknown' }
  }
}

// A union of literals is an enum and its options are those literals. Anything
// else in it, `string | undefined` for one, is not a closed set to offer.
function union(annotation: Node): { type: PropKind; options?: unknown[] } {
  const types = annotation['types'] as Node[]
  const literals = types.filter((one) => one.type === 'TSLiteralType')

  if (literals.length !== types.length) return { type: 'unknown' }

  // Through `literalOf` too: `-1` is a `UnaryExpression` under its
  // `TSLiteralType`, so reading `value` gave `undefined`, which JSON writes as
  // `null`. A union of three offered `[null, 0, 1]`, an option the type does not
  // hold. Measured. One unreadable member drops the enum rather than the member,
  // since a set missing one of its values is worse than no set at all.
  const read = literals.map((one) => literalOf(one['literal'] as Node))
  if (read.some((one) => one === undefined)) return { type: 'unknown' }

  return { type: 'enum', options: read.map((one) => one?.value) }
}

function reference(annotation: Node): { type: PropKind } {
  const typeName = annotation['typeName'] as Node | null
  const name = typeName?.['name'] ?? (typeName?.['right'] as Node | null)?.['name']

  if (name === 'Array' || name === 'ReadonlyArray') return { type: 'array' }
  if (typeof name === 'string' && NODES.has(name)) return { type: 'node' }

  return { type: 'unknown' }
}
