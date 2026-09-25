// What a component file declares about its props, read without running it.
// See section 3.2 of docs/contracts.md.

import { readFileSync } from 'node:fs'
import type { PropKind, ResolvedPropDetails } from '@crypte/core/protocol'
import { parseSync } from 'vite'
import { literalOf, propertyOf, type Node } from './ast'

interface Comment {
  type: string
  value: string
  start: number
  end: number
}

// What reading a component gives: its props, and why none could be read when
// that is the case. `unread` is what tells a component with no props from one
// the reader could not follow, both of which give no details. Section 4.2.
export interface PropsRead {
  details: Record<string, ResolvedPropDetails>
  unread?: string
}

// Nothing here is ever fatal. A file that does not parse, a component that is not
// found, a type that says nothing: each gives fewer props, never an error, and
// the story renders either way. Section 8 of docs/contracts.md.
export function propsOf(file: string, exported: string): PropsRead {
  let source: string
  let parsed: ReturnType<typeof parseSync>

  try {
    source = readFileSync(file, 'utf8')
    parsed = parseSync(file, source)
  } catch (error) {
    // Absent is the common case: a component from a package, or reached through
    // a Vite plugin, keeps the specifier the story wrote, which names no file.
    const absent = (error as { code?: string }).code === 'ENOENT'
    return {
      details: {},
      unread: absent ? 'its file could not be found' : 'its file could not be read',
    }
  }

  if (parsed.errors.length > 0) return { details: {}, unread: 'its file does not parse' }

  const body = parsed.program.body as unknown as Node[]
  const comments = parsed.comments as unknown as Comment[]
  const found = componentOf(body, exported)
  if (!found) {
    const named = exported === 'default' ? 'the default export' : `\`${exported}\``
    return { details: {}, unread: `${named} is not declared in a form the reader follows` }
  }

  // A component that takes no parameter has no props, and that is a reading.
  const { parameter } = found
  if (!parameter) return { details: {} }

  const members = membersOf(body, parameter, found.annotation)
  const defaults = defaultsOf(parameter)
  const pattern = destructured(parameter)

  // No type the reader can follow and no destructured name: nothing is known,
  // which is not the same as a type that declares no member. One reason for
  // every such type, since the reader cannot tell why: an imported type, a
  // generic like `Omit<P, 'a'>`, or one on the variable, `const B: FC<P>`.
  if (members === undefined && pattern.length === 0) {
    return { details: {}, unread: 'its props type is not one the reader follows' }
  }

  // Both halves: an unresolvable `extends` leaves a name like `className` only
  // in the pattern, so the type's members alone would drop it.
  const named: Member[] = members
    ? [...members, ...pattern.filter((one) => !members.some((member) => member.name === one.name))]
    : pattern

  const details: Record<string, ResolvedPropDetails> = {}

  for (const { name, optional, method, annotation, at, read, preset } of named) {
    const described = describe(source, comments, at)
    const kind = method
      ? { type: 'function' as PropKind }
      : (read ?? (annotation ? kindOf(annotation, body) : { type: 'unknown' as PropKind }))
    // The pattern's default is what the component passes, so it wins even when
    // its value cannot be read.
    const fallback = defaults.named.has(name) ? defaults.values[name] : preset

    details[name] = {
      ...kind,
      // A default makes a prop optional for whoever calls the component, even
      // one the type declares required, and even one whose value cannot be read.
      required: !optional && !defaults.named.has(name),
      ...(described === undefined ? {} : { description: described }),
      ...(fallback === undefined ? {} : { default: fallback }),
    }
  }

  return { details }
}

interface Member {
  name: string
  optional: boolean
  // Declared as a method rather than a property, which fixes its kind.
  method?: boolean
  annotation: Node | undefined
  // Where the member starts, so the comment that precedes it can be found.
  at: number
  // A kind already read from somewhere other than an annotation.
  read?: { type: PropKind; options?: unknown[] }
  // A default the type's source declares, which the pattern's own overrides.
  preset?: unknown
}

// The first parameter of the exported component, whatever shape declares it,
// and the props type a `forwardRef<Ref, Props>` gives when the parameter has none.
interface Found {
  parameter?: Node
  annotation?: Node
}

function componentOf(body: Node[], exported: string): Found | undefined {
  // `export default Badge` names a declaration further up, and `export default
  // memo(Badge)` wraps one: both are followed like any other expression.
  if (exported === 'default') {
    const declaration = body.find((node) => node.type === 'ExportDefaultDeclaration')?.[
      'declaration'
    ] as Node | undefined
    const found = declaration && fromExpression(body, declaration, new Set())
    if (found) return found
  }

  return foundOf(body, exported, new Set())
}

function foundOf(body: Node[], exported: string, seen: Set<string>): Found | undefined {
  // `const A = memo(B)` and `const B = memo(A)` would follow each other forever.
  if (seen.has(exported)) return undefined
  seen.add(exported)

  for (const node of body) {
    const declaration = (node['declaration'] ?? node) as Node

    if (declaration.type === 'FunctionDeclaration') {
      const name = (declaration['id'] as Node | null)?.['name']
      if (name === exported || (exported === 'default' && node.type === 'ExportDefaultDeclaration'))
        return fromExpression(body, declaration, seen)
    }

    if (declaration.type === 'VariableDeclaration') {
      for (const one of declaration['declarations'] as Node[]) {
        const name = (one['id'] as Node | null)?.['name']
        const init = one['init'] as Node | null
        if (name === exported && init) return fromExpression(body, init, seen)
      }
    }
  }

  return undefined
}

// A function gives its first parameter; a name is followed in the same file; a
// wrapper hands on to its first argument. Anything else, a factory, a class, a
// call of another helper, gives nothing rather than a guess.
function fromExpression(body: Node[], expression: Node, seen: Set<string>): Found | undefined {
  if (
    expression.type === 'ArrowFunctionExpression' ||
    expression.type === 'FunctionExpression' ||
    expression.type === 'FunctionDeclaration'
  ) {
    const parameter = (expression['params'] as Node[])[0]
    return parameter ? { parameter } : {}
  }

  if (expression.type === 'Identifier') return foundOf(body, expression['name'] as string, seen)

  if (expression.type !== 'CallExpression') return undefined

  const wrapper = wrapperOf(expression['callee'] as Node)
  const first = (expression['arguments'] as Node[])[0]
  if (!wrapper || !first) return undefined

  const found = fromExpression(body, first, seen)
  if (!found || wrapper !== 'forwardRef' || found.annotation || found.parameter?.['typeAnnotation'])
    return found

  const props = (
    (expression['typeArguments'] as Node | null)?.['params'] as Node[] | undefined
  )?.[1]
  return props ? { ...found, annotation: props } : found
}

// `memo` and `forwardRef`, bare or on any namespace (`import * as R` gives
// `R.memo`), and `Object.assign`,
// whose first argument is the component the compound parts hang from.
function wrapperOf(callee: Node): 'memo' | 'forwardRef' | 'assign' | undefined {
  const name =
    callee.type === 'Identifier'
      ? callee['name']
      : callee.type === 'MemberExpression'
        ? (callee['property'] as Node)['name']
        : undefined
  if (name === 'memo' || name === 'forwardRef') return name

  const object = callee.type === 'MemberExpression' ? (callee['object'] as Node)['name'] : undefined
  return name === 'assign' && object === 'Object' ? 'assign' : undefined
}

// The members of the parameter's declared type, or nothing when no type says.
// A named type is looked up in the same file only: following an import is a
// resolver's job, and this runs before any server exists.
function membersOf(body: Node[], parameter: Node, fallback?: Node): Member[] | undefined {
  const annotation =
    ((parameter['typeAnnotation'] as Node | null)?.['typeAnnotation'] as Node | undefined) ??
    fallback
  if (!annotation) return undefined

  return typeMembers(body, annotation)
}

// `ComponentProps<'button'> & VariantProps<typeof x> & { asChild?: boolean }`,
// the shadcn shape: each part that resolves adds its members, and a part that
// does not, the DOM one here, adds none.
function typeMembers(
  body: Node[],
  annotation: Node,
  seen = new Set<string>(),
): Member[] | undefined {
  if (annotation.type === 'TSTypeLiteral') return signatures(annotation)

  // Nothing when no part resolves, so that an intersection of imported types
  // reads as unfollowed rather than as a type with no member.
  if (annotation.type === 'TSIntersectionType') {
    const parts = (annotation['types'] as Node[]).map((one) => typeMembers(body, one, seen))
    return parts.every((one) => one === undefined) ? undefined : parts.flatMap((one) => one ?? [])
  }

  return (
    variants(body, annotation['typeName'] as Node | null, annotation) ??
    namedType(body, annotation, seen)
  )
}

// What `type name = …` names, when this file declares it.
function aliasOf(body: Node[], name: string): Node | undefined {
  for (const node of body) {
    const declaration = (node['declaration'] ?? node) as Node
    if (declaration.type !== 'TSTypeAliasDeclaration') continue
    if ((declaration['id'] as Node | null)?.['name'] === name)
      return declaration['typeAnnotation'] as Node
  }

  return undefined
}

// The declaration a type reference points at, when this file holds it.
// `seen` stops `type P = P & Q`: it does not type-check, but it parses.
function namedType(body: Node[], annotation: Node, seen: Set<string>): Member[] | undefined {
  if (annotation.type !== 'TSTypeReference') return undefined

  const name = (annotation['typeName'] as Node | null)?.['name']
  if (typeof name !== 'string' || seen.has(name)) return undefined

  for (const node of body) {
    const declaration = (node['declaration'] ?? node) as Node

    const declared = (declaration['id'] as Node | null)?.['name']
    if (declared !== name) continue

    if (declaration.type === 'TSInterfaceDeclaration') {
      const clauses = declaration['extends'] as Node[]
      const inherited = clauses.map((one) => variants(body, one['expression'] as Node, one))
      const own = signatures(declaration['body'] as Node)

      // Nothing of its own and nothing it extends that resolves reads as
      // unfollowed, like an intersection of imported types. `interface P {}`
      // extends nothing, and has no props.
      if (own.length === 0 && clauses.length > 0 && inherited.every((one) => one === undefined))
        return undefined

      return [...inherited.flatMap((one) => one ?? []), ...own]
    }
    if (declaration.type === 'TSTypeAliasDeclaration')
      return typeMembers(body, declaration['typeAnnotation'] as Node, new Set([...seen, name]))
  }

  return undefined
}

// CVA's options are keys of an object literal, so reading them needs no type
// checker as long as `const x = cva(base, { variants })` is in this file. An
// imported `x`, or one built any other way, stays out of reach and its props
// keep coming from the pattern alone.
//
// A variant keyed `true` or `false` is a boolean to CVA, not those two
// strings: it stays `unknown` rather than offering them. Reopened by a design
// system that writes one.
function variants(body: Node[], name: Node | null, reference: Node): Member[] | undefined {
  if (name?.['name'] !== 'VariantProps') return undefined

  const query = ((reference['typeArguments'] as Node | null)?.['params'] as Node[] | undefined)?.[0]
  const target = query?.type === 'TSTypeQuery' ? (query['exprName'] as Node)['name'] : undefined
  if (typeof target !== 'string') return undefined

  const config = cvaConfig(body, target)
  const declared = propertyOf(config, 'variants')
  if (declared?.type !== 'ObjectExpression') return undefined

  const defaults = propertyOf(config, 'defaultVariants')

  return (declared['properties'] as Node[]).flatMap((one) => {
    if (one.type !== 'Property') return []
    const name = nameOf(one['key'] as Node, one['computed'] === true)
    if (name === undefined) return []

    const preset = literalOf(propertyOf(defaults ?? undefined, name))?.value
    return [
      {
        name,
        optional: true,
        annotation: undefined,
        at: one.start,
        read: optionsOf(one['value'] as Node),
        ...(preset === undefined ? {} : { preset }),
      },
    ]
  })
}

// The second argument of `cva(…)` assigned to that name in this file.
function cvaConfig(body: Node[], target: string): Node | undefined {
  for (const node of body) {
    const declaration = (node['declaration'] ?? node) as Node
    if (declaration.type !== 'VariableDeclaration') continue

    for (const one of declaration['declarations'] as Node[]) {
      const init = one['init'] as Node | null
      if ((one['id'] as Node | null)?.['name'] !== target || init?.type !== 'CallExpression')
        continue
      if ((init['callee'] as Node)['name'] !== 'cva') return undefined
      return (init['arguments'] as Node[])[1]
    }
  }

  return undefined
}

// One key the file cannot name drops the whole enum, never just itself.
function optionsOf(value: Node): { type: PropKind; options?: unknown[] } {
  if (value.type !== 'ObjectExpression') return { type: 'unknown' }

  const keys = (value['properties'] as Node[]).map((one) =>
    one.type === 'Property' ? nameOf(one['key'] as Node, one['computed'] === true) : undefined,
  )
  if (keys.some((one) => one === undefined || one === 'true' || one === 'false'))
    return { type: 'unknown' }

  return { type: 'enum', options: keys }
}

// The name a key writes. A computed key has none that can be read without
// running the file, and section 4.2 forbids guessing one.
function nameOf(key: Node, computed: boolean): string | undefined {
  if (computed) return undefined
  if (key.type === 'Identifier') return String(key['name'])

  const written = key.type === 'Literal' ? key['value'] : undefined

  return typeof written === 'string' && written !== '' ? written : undefined
}

// The named members of an interface body or a type literal. `onClick(): void`
// read as a property was absent, and the pattern rescued it as optional. An
// index signature names nothing, so it is not one.
function signatures(literal: Node): Member[] {
  const found = (literal['body'] ?? literal['members']) as Node[] | undefined

  return (found ?? [])
    .filter((one) => one.type === 'TSPropertySignature' || one.type === 'TSMethodSignature')
    .flatMap((one): Member[] => {
      const name = nameOf(one['key'] as Node, one['computed'] === true)
      if (name === undefined) return []

      return [
        {
          name,
          optional: one['optional'] === true,
          method: one['kind'] === 'method',
          annotation: annotationOf(one),
          at: one.start,
        },
      ]
    })
}

// A getter carries its type as its return type, a setter as its parameter. A
// method carries none to read: `method` fixes its kind instead.
function annotationOf(one: Node): Node | undefined {
  // The type inside its wrapper, which every shape below carries.
  const inside = (wrapper: unknown) =>
    (wrapper as Node | null)?.['typeAnnotation'] as Node | undefined

  if (one['kind'] === 'get') return inside(one['returnType'])
  if (one['kind'] === 'set') return inside((one['params'] as Node[])[0]?.['typeAnnotation'])

  return inside(one['typeAnnotation'])
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

// Two sets, not one: `{ tone = compute() }` makes the prop optional, so its name
// is kept, but a computed value does not survive JSON, so its value is not.
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

    // `literalOf` and not `type === 'Literal'`: a bigint and a regexp are
    // `Literal` nodes too, and `JSON.stringify` throws on both.
    const read = literalOf(value['right'] as Node)
    if (read) values[name] = read.value
  }

  return { named, values }
}

// The block comment that ends just before a member, its JSDoc stars and margin
// removed. Anything further up belongs to something else.
function describe(source: string, comments: Comment[], at: number): string | undefined {
  // JSDoc only: a trailing `//` on the previous line, or an
  // `/* eslint-disable-next-line */`, otherwise becomes a published description.
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

function kindOf(
  annotation: Node,
  body: Node[],
  seen = new Set<string>(),
): { type: PropKind; options?: unknown[] } {
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
      return reference(annotation, body, seen)
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

  // `literalOf` and not `value`: `-1` is a `UnaryExpression` under its
  // `TSLiteralType`, and reading `value` would write `null` into the options.
  // One unreadable member drops the whole enum, never just itself.
  const read = literals.map((one) => literalOf(one['literal'] as Node))
  if (read.some((one) => one === undefined)) return { type: 'unknown' }

  return { type: 'enum', options: read.map((one) => one?.value) }
}

// A type alias of this file is read as what it names, so `rank: Rank` gives
// the same enum as the union written in place. An imported one stays
// `unknown`. `seen` stops `type A = A`, which parses without type-checking.
function reference(
  annotation: Node,
  body: Node[],
  seen: Set<string>,
): { type: PropKind; options?: unknown[] } {
  const typeName = annotation['typeName'] as Node | null
  const name = typeName?.['name'] ?? (typeName?.['right'] as Node | null)?.['name']

  const local = typeName?.type === 'Identifier' && !seen.has(String(name))
  const aliased = local ? aliasOf(body, String(name)) : undefined
  if (aliased) return kindOf(aliased, body, new Set([...seen, String(name)]))

  if (name === 'Array' || name === 'ReadonlyArray') return { type: 'array' }
  if (typeof name === 'string' && NODES.has(name)) return { type: 'node' }

  return { type: 'unknown' }
}
