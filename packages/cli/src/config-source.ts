// `crypte.config.ts` is read as text, never run: section 1.5 allows a Vite plugin
// there, and loading one in the browser kills the entry before it can signal `ready`.

import { readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { parseSync } from 'vite'
import { propertyOf, type Node } from './ast'
import { ConfigError } from './errors'
import { capture, isBareSpecifier } from './paths'
import type { Project } from './project'

// The imports and the expression the browser needs to build the adapter, as text.
// Never guessed from `adapter.name`: that breaks the moment an adapter is wrapped.
export function adapterSource(project: Project): { imports: string[]; expression: string } {
  return required(configSources(project).adapter)
}

// The adapter is the one field the entry cannot do without. Written once: two
// copies of this sentence would drift, and it is the message a user reads.
export function required(found: { imports: string[]; expression: string } | undefined): {
  imports: string[]
  expression: string
} {
  if (found === undefined) {
    throw new ConfigError(
      'crypte.config.ts must declare `adapter` in the object it exports, written in place.',
    )
  }

  return found
}

// The packages the configuration imports, by bare name, for Vite to pre-bundle.
// A linked workspace package that is not pre-bundled keeps serving stale dependency
// URLs across a re-optimisation. See docs/internal/architecture.md.
export function configPackages(project: Project): string[] {
  const sources = configSources(project)
  const statements = [...(sources.adapter?.imports ?? []), ...(sources.wrap?.imports ?? [])]

  // `@/adapters/mine` reads as bare but is a project file the optimiser cannot
  // pre-bundle. Judged by the resolver's own `capture`, never by a rule about `@`.
  const aliased = (one: string) =>
    Object.keys(project.paths?.paths ?? {}).some((pattern) => capture(pattern, one) !== null)

  const named = statements
    .map((one) => /from\s+['"]([^'"]+)['"]/.exec(one)?.[1])
    .filter((one): one is string => one !== undefined)
    .filter((one) => isBareSpecifier(one) && !aliased(one))

  return [...new Set(named)]
}

// Both fields the browser needs from the configuration, read in one parse: the
// adapter, and the global `wrap` of section 2.5 when the file declares one.
export function configSources(project: Project): {
  adapter?: { imports: string[]; expression: string }
  wrap?: { imports: string[]; expression: string }
} {
  const file = join(project.root, 'crypte.config.ts')
  const source = readFileSync(file, 'utf8')
  const parsed = parseSync('crypte.config.ts', source)

  if (parsed.errors.length > 0) {
    throw new ConfigError(`crypte.config.ts could not be parsed: ${parsed.errors[0]?.message}`)
  }

  return {
    adapter: fieldSource('adapter', source, parsed, project.root),
    wrap: fieldSource('wrap', source, parsed, project.root),
  }
}

// One field of the exported object, as text, plus the imports it names. Rends
// `undefined` when the file does not declare it: `adapter` is required and its
// caller says so, `wrap` is not.
function fieldSource(
  field: string,
  source: string,
  parsed: ReturnType<typeof parseSync>,
  root: string,
): { imports: string[]; expression: string } | undefined {
  const value = fieldExpression(parsed.program.body as unknown as Node[], field)
  if (value === undefined) return undefined

  const locals = new Map<string, Node>()
  for (const one of parsed.module.staticImports as unknown as Node[]) {
    for (const entry of (one['entries'] as Node[]) ?? []) {
      locals.set((entry['localName'] as Node)['value'] as string, one)
    }
  }

  const names = referenced(value)

  // Only the expression and its imports travel, so a name the file computes lands
  // dangling in the browser. Declared names only: a name neither declared nor
  // imported is a global, and refusing those would refuse `process.env`.
  const own = declared(parsed.program.body as unknown as Node[])
  const built = [...names].find((name) => own.has(name))
  if (built !== undefined) {
    throw new ConfigError(
      `crypte.config.ts hands \`${field}\` a value it builds itself (\`${built}\`). ` +
        `Write the ${field} in place, or import it: the preview reads this file, it never runs it.`,
    )
  }

  // Read from the tree, never from the text: a word test matches inside a string
  // too, and `{ runtime: 'react' }` then carries `@vitejs/plugin-react` along.
  const needed = new Set<Node>()
  for (const name of names) {
    const one = locals.get(name)
    if (one) needed.add(one)
  }

  const imports = [...needed].map((one) => served(one, source, field, root))

  return { imports, expression: source.slice(value.start, value.end) }
}

// An import of the configuration, rewritten root-absolute: the entry is a virtual
// module, so a relative specifier would resolve against it and not the project.
function served(one: Node, source: string, field: string, root: string): string {
  const request = one['moduleRequest'] as Node | undefined
  const specifier = request?.['value'] as string | undefined
  const statement = source.slice(one.start, one.end)

  if (request === undefined || specifier === undefined || !specifier.startsWith('.')) {
    return statement
  }

  // Resolved against the real root, not by normalising a string:
  // `posix.normalize('/../x')` yields `/x`, so a `../` escaped in silence.
  // Measured.
  const inside = relative(root, resolve(root, specifier))
  const rooted = `/${inside.split(sep).join('/')}`

  if (inside.startsWith('..')) {
    throw new ConfigError(
      `crypte.config.ts imports \`${specifier}\` for \`${field}\`, which is outside the project. ` +
        'The preview serves the project, so move the file under it or import a package.',
    )
  }

  return (
    statement.slice(0, request.start - one.start) +
    JSON.stringify(rooted) +
    statement.slice(request.end - one.start)
  )
}

// The names a list of statements declares. Used on the file, where everything
// else an expression mentions is either imported or global, and on a block
// inside the expression, where the same names are the expression's own.
function declared(body: Node[]): Set<string> {
  const found = new Set<string>()

  for (const node of body) {
    // `export const runtime = …` holds its declaration one level deeper, and
    // reading only the top level made it look undeclared. Measured.
    const one =
      node.type === 'ExportNamedDeclaration'
        ? ((node['declaration'] as Node | undefined) ?? node)
        : node

    // Read from the shape, never from a list of node types: every form that binds a
    // name carries it in `id` or `declarations`, and a list keeps missing one.
    for (const name of bindings(one['id'] as Node | undefined)) found.add(name)

    for (const declarator of (one['declarations'] as Node[]) ?? []) {
      for (const name of bindings(declarator['id'] as Node | undefined)) found.add(name)
    }
  }

  hoisted(body, found)

  return found
}

// A `var` belongs to the file or the function, never to the block it sits in, so
// `{ var runtime = 'react' }` declares `runtime` and a top-level read misses it.
function hoisted(node: unknown, found: Set<string>): void {
  if (node === null || typeof node !== 'object') return

  if (Array.isArray(node)) {
    for (const item of node) hoisted(item, found)
    return
  }

  const inner = node as Node

  // A function's own `var` is its own, so the walk stops at its edge.
  if (FUNCTIONS.has(inner.type)) return

  if (inner.type === 'VariableDeclaration' && inner['kind'] === 'var') {
    for (const declarator of (inner['declarations'] as Node[]) ?? []) {
      for (const name of bindings(declarator['id'] as Node | undefined)) found.add(name)
    }
  }

  for (const held of Object.values(inner)) hoisted(held, found)
}

// Every name a binding position holds, read from the shape and not from a list of
// pattern types. A name too many is never harmless: it refuses a valid config in
// `declared`, and drops an import the entry needs in `referenced`.
function bindings(node: Node | undefined): string[] {
  const found: string[] = []

  const walk = (current: unknown): void => {
    if (current === null || typeof current !== 'object') return

    if (Array.isArray(current)) {
      for (const item of current) walk(item)
      return
    }

    const inner = current as Node
    if (inner.type === 'Identifier') {
      found.push(inner['name'] as string)
      return
    }

    for (const [key, held] of Object.entries(inner)) {
      // A default's right side and a key, computed or not, are expressions. The
      // key of `{ a: b }` binds `b`, and the key of `{ [field]: value }` binds
      // `value`: neither binds what is written on the left.
      if (key === 'right' && inner.type === 'AssignmentPattern') continue
      if (key === 'key' && inner.type === 'Property') continue
      if (key === 'typeAnnotation') continue
      walk(held)
    }
  }

  walk(node)

  return found
}

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'])

// The node types that carry their own names, so that a parameter shadowing a
// name of the file does not make the expression look like it uses that name. A
// class expression is one: it carries its own `id` and its static blocks.
const CARRIES = new Set([
  ...FUNCTIONS,
  'CatchClause',
  'ClassExpression',
  'ClassDeclaration',
  'StaticBlock',
])

// A class member names itself, so `class { make() {} }` does not read a `make`
// of the file. Measured: it produced a false « builds itself » refusal.
const MEMBERS = new Set(['MethodDefinition', 'PropertyDefinition', 'AccessorProperty'])

// The `TS…` nodes that hold a value, and so the only ones the walk enters: one
// missing here drops an import the entry needs. See docs/internal/architecture.md.
const VALUED = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
  'TSParameterProperty',
  'TSEnumDeclaration',
  'TSEnumBody',
  'TSEnumMember',
])

// The keys by which a value node points at a type. Doubled with the family
// above on purpose: a name has to be missing from both lists to travel.
// Voir docs/internal/architecture.md.
const TYPED = new Set(['typeAnnotation', 'typeArguments', 'typeParameters', 'returnType'])

// The names an expression takes from outside itself. A key (`{ react: true }`) and
// a property (`opts.react`) are not names: counted, they carry an import along.
function referenced(node: Node): Set<string> {
  const found = new Set<string>()

  const walk = (current: unknown, bound: Set<string>): void => {
    if (current === null || typeof current !== 'object') return

    if (Array.isArray(current)) {
      for (const item of current) walk(item, bound)
      return
    }

    const inner = current as Node

    // Types name nothing the browser loads, and a type position is any `TS…`
    // node outside `VALUED`. Voir docs/internal/architecture.md.
    if (inner.type.startsWith('TS') && !VALUED.has(inner.type)) return

    // Named, then walked through: a name can hang off an identifier, and stopping
    // here left its import behind. Measured on `opts.react`, where `react` is
    // read from the property of an access, not from the file.
    if (inner.type === 'Identifier') {
      const name = inner['name'] as string
      if (!bound.has(name)) found.add(name)
    }

    // `(opts) => opts.react` names nothing of the file, even where the file
    // declares `opts`: the expression brings that name with it.
    const inside = CARRIES.has(inner.type) ? new Set(bound) : bound
    if (inside !== bound) {
      for (const param of (inner['params'] as Node[]) ?? []) {
        for (const name of bindings(param)) inside.add(name)
      }

      for (const name of bindings(inner['param'] as Node | undefined)) inside.add(name)

      // A named expression names itself: `new (class Frame {})()` reads no
      // `Frame` of the file. Measured, it produced a false « builds itself ».
      for (const name of bindings(inner['id'] as Node | undefined)) inside.add(name)

      // A static block holds its statements directly, a function under a block.
      const body = inner['body'] as Node | Node[] | undefined
      const statements = Array.isArray(body)
        ? body
        : body?.type === 'BlockStatement'
          ? ((body['body'] as Node[]) ?? [])
          : []

      for (const name of declared(statements)) inside.add(name)
    }

    const fixed =
      inner['computed'] === true
        ? undefined
        : inner.type === 'Property'
          ? 'key'
          : inner.type === 'MemberExpression'
            ? 'property'
            : MEMBERS.has(inner.type)
              ? 'key'
              : inner.type === 'TSEnumMember'
                ? 'id'
                : undefined

    for (const [key, held] of Object.entries(inner)) {
      if (key === fixed || TYPED.has(key)) continue
      walk(held, inside)
    }
  }

  walk(node, new Set())

  return found
}

// `export default defineConfig({ … })` or `export default { … }`, either form.
// Read by `propertyOf`, the story files' reader: a second copy of its three rules
// on quoted, repeated and computed keys had all three wrong.
function fieldExpression(body: Node[], field: string): Node | undefined {
  const exported = body.find((node) => node.type === 'ExportDefaultDeclaration')
  const declaration = exported?.['declaration'] as Node | undefined
  const object =
    declaration?.type === 'CallExpression'
      ? ((declaration['arguments'] as Node[])[0] as Node | undefined)
      : declaration

  return propertyOf(object, field) ?? undefined
}
