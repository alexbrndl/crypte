// The two pages `crypte dev` serves, and where each comes from.
// See docs/decisions.md and docs/internal/architecture.md.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import sirv from 'sirv'
import { parseSync, transformWithOxc, type Plugin, type ViteDevServer } from 'vite'
import { ConfigError } from './errors'
import { capture, isBareSpecifier } from './paths'
import { storyFilesOf, type Catalogue } from './manifest'
import { cssEntryOf, type Project } from './project'

// The shell is built ahead of time and copied into `dist/shell` when the CLI is
// packed. It knows no framework: it reads a manifest and talks over the channel.
//
// Resolved from the package root rather than from this file, which sits in
// `src/` before the build and in `dist/` after it. Walking up to `package.json`
// gives the same answer in both cases.
function packageRoot(): string {
  let here = dirname(fileURLToPath(import.meta.url))

  while (!existsSync(join(here, 'package.json'))) {
    const up = dirname(here)
    if (up === here) throw new ConfigError('No package.json above @crypte/cli.')
    here = up
  }

  return here
}

const SHELL = join(packageRoot(), 'dist', 'shell')

// The preview is not prebuilt and cannot be: it imports the adapter the user
// installed and the story modules of their project, so it belongs to their
// bundle. Section 4.1 of docs/contracts.md.
export const PREVIEW_ENTRY = '/@crypte/preview.js'

// Rollup's mark for a module that has no file. Without it the entry is taken for
// a path, and every import inside it resolves against a folder that does not
// exist. Measured: `@crypte/core/preview` was looked for six levels above the
// project.
const VIRTUAL = '\0'

// The id the module graph knows the entry by. Exported so a rebuild can
// invalidate it: nothing imports the entry, so nothing propagates to it.
export const PREVIEW_ENTRY_ID = `${VIRTUAL}${PREVIEW_ENTRY}`

// Where the shell reads the catalogue. Served from memory rather than from
// `.crypte/manifest.json`: that file is an artefact, and reading it back would
// show a stale catalogue whenever a write failed.
export const MANIFEST_ROUTE = '/@crypte/manifest.json'

export const PREVIEW_PAGE = '/preview.html'

export function shellAssets(): string {
  if (!existsSync(join(SHELL, 'index.html'))) {
    throw new ConfigError(
      'This @crypte/cli was published without its shell, so `crypte dev` has no page to serve. ' +
        'Reinstall the package, and report it: https://github.com/alexbrndl/crypte/issues. ' +
        'Working in the repository itself? Run `vp run -r pack` at its root.',
    )
  }

  return SHELL
}

// One plugin for both pages. Neither is a file in the project: they belong to
// the CLI, and writing them into the project would leave behind something
// nobody asked for.
//
// The catalogue is read at each request, never captured: a story added while
// the server runs must reach the shell without a restart.
export function servePlugin(project: Project, current: () => Catalogue): Plugin {
  const shell = shellAssets()

  // Held for `compiled`: without the resolved config, oxc reads a different
  // tsconfig cache than the one Vite clears when the file changes, and the entry
  // keeps the old `compilerOptions` until the process restarts. Measured.
  let dev: ViteDevServer | undefined

  return {
    name: 'crypte:serve',

    // `custom`, not `spa`: Vite's fallback rewrites every unknown URL to
    // `/index.html`, so `/preview.html` and the manifest route were both served
    // the shell's page. Measured. Both pages are served here, and there is
    // nothing left to guess.
    config() {
      return {
        appType: 'custom',
        // The channel comes from the CLI's own dependencies, never from the
        // project's. Section 1.4 of docs/contracts.md: a user installs two
        // packages, and `@crypte/core` is not one of them. Without this alias
        // the preview asks their project for a package they never declared.
        resolve: { alias: { '@crypte/core/preview': channelPath() } },
      }
    },

    configureServer(server) {
      dev = server

      // The shell's own files, `/assets/…`, served from where they were copied.
      // Without this the page loads and its bundle answers 404: Vite is rooted
      // in the project, which knows nothing of them. Measured, blank screen.
      server.middlewares.use(sirv(shell, { dev: true, etag: true }))

      // Before Vite's own middlewares rather than after. The fallback above is
      // gone, but the order is still where these routes are claimed.
      server.middlewares.use((request, response, next) => {
        const url = (request.url ?? '/').split('?')[0] ?? '/'

        if (url === MANIFEST_ROUTE) {
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify(current().manifest))
          return
        }

        const html = url === '/' || url === '/index.html' ? shellHtml(shell) : undefined
        const page = url === PREVIEW_PAGE ? previewHtml() : html

        if (page === undefined) {
          next()
          return
        }

        server
          .transformIndexHtml(url, page)
          .then((transformed) => {
            response.setHeader('Content-Type', 'text/html')
            response.end(transformed)
          })
          .catch(next)
      })
    },

    resolveId(id) {
      return id === PREVIEW_ENTRY ? PREVIEW_ENTRY_ID : undefined
    },

    load(id) {
      if (id !== PREVIEW_ENTRY_ID) return undefined

      // Typed here rather than by Vite: a virtual module is not transformed by
      // its extension, measured. The entry copies the configuration's own
      // expression, so `adapter: createAdapter() as Kind` reached the browser as
      // TypeScript and died on a `SyntaxError`. `DCJ-224`.
      return compiled(previewEntry(project, storyFilesOf(current())), project.root, dev, (one) =>
        this.warn(one),
      )
    },
  }
}

// Where the preview's channel really lives, read from the CLI's own resolution
// so that no version of it is ever guessed.
function channelPath(): string {
  try {
    return fileURLToPath(import.meta.resolve('@crypte/core/preview'))
  } catch (cause) {
    throw new ConfigError('@crypte/core/preview is not resolvable from @crypte/cli.', { cause })
  }
}

function shellHtml(shell: string): string {
  return readFileSync(join(shell, 'index.html'), 'utf8')
}

export function previewHtml(): string {
  return [
    '<!doctype html>',
    '<html lang="fr">',
    '  <head><meta charset="UTF-8" /><title>Preview</title></head>',
    '  <body>',
    '    <div id="root"></div>',
    `    <script type="module" src="${PREVIEW_ENTRY}"></script>`,
    '  </body>',
    '</html>',
  ].join('\n')
}

// Every name the generated entry declares carries this prefix, and the core's
// imports are aliased into it. A name the configuration imports lands in the same
// top-level scope: `import { adapter } from './setup'` next to `const adapter =
// adapter` is a `SyntaxError: Identifier 'adapter' has already been declared`, so
// the preview never loads at all. Measured, and it held for a dozen names.
// See docs/internal/architecture.md.
const OWN = '__crypte_'

// What the browser needs to build the adapter: the imports it uses, and the
// expression itself, both taken from the project's configuration as text.
//
// Read and never executed. Importing `crypte.config.ts` from the preview looked
// tidier and was wrong: section 1.5 allows `vite: { plugins: [react()] }` there,
// so the browser would load a Vite plugin, which reaches for `node:module`. The
// entry would fail before `createPreviewChannel`, so no `ready` would leave and
// the shell would sit on an empty frame with nothing to show.
//
// Guessing a package from `adapter.name` is the other wrong answer: it breaks
// the moment somebody wraps an adapter. The text says what the author wrote.
export function adapterSource(project: Project): { imports: string[]; expression: string } {
  return required(configSources(project).adapter)
}

// The adapter is the one field the entry cannot do without. Written once: two
// copies of this sentence would drift, and it is the message a user reads.
function required(found: { imports: string[]; expression: string } | undefined): {
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

// The packages the configuration imports for the preview, by their bare name.
//
// Vite pre-bundles these rather than serving them as graph modules. A linked
// workspace package is the awkward middle case: it sits in `node_modules` but is
// not pre-bundled, so its rewritten dependency URLs are never invalidated when
// the optimiser rewrites its bundles. Measured on the demo: after two
// re-optimisations the adapter was still served with two stale hashes, and the
// browser assembled four generations at once, which is the missing export of
// `DCJ-221`. See docs/internal/architecture.md.
export function configPackages(project: Project): string[] {
  const sources = configSources(project)
  const statements = [...(sources.adapter?.imports ?? []), ...(sources.wrap?.imports ?? [])]

  // A specifier the project's own paths capture is one of its files, not a
  // package: `@/adapters/mine` reads as bare and would be handed to the optimiser,
  // which has no package to pre-bundle. Judged by the resolver's own `capture`
  // rather than by a rule about `@`. Measured at exploration.
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

  // A name this file declares is something it computed, which the browser
  // cannot reach: only the expression and its imports travel. `{ adapter }`
  // written short emitted `const adapter = adapter`, and `const runtime =
  // 'react'` used as `createAdapter({ runtime })` emitted the same kind of
  // dangling name: a ReferenceError at load time, so before the channel opens,
  // so an empty frame with nothing to say. Measured, both.
  //
  // Declared here rather than anywhere: a name that is neither declared nor
  // imported is a global, and refusing those would refuse `process.env`.
  const own = declared(parsed.program.body as unknown as Node[])
  const built = [...names].find((name) => own.has(name))
  if (built !== undefined) {
    throw new ConfigError(
      `crypte.config.ts hands \`${field}\` a value it builds itself (\`${built}\`). ` +
        `Write the ${field} in place, or import it: the preview reads this file, it never runs it.`,
    )
  }

  // Only the imports the expression really names, read from the tree and not
  // from the text. A word test also matches inside a string, so
  // `createAdapter({ runtime: 'react' })` carried `import react from
  // '@vitejs/plugin-react'` into the browser: the very thing reading rather
  // than importing exists to avoid. Measured.
  const needed = new Set<Node>()
  for (const name of names) {
    const one = locals.get(name)
    if (one) needed.add(one)
  }

  const imports = [...needed].map((one) => served(one, source, field, root))

  return { imports, expression: source.slice(value.start, value.end) }
}

// An import of the configuration, rewritten for the entry the browser loads. The
// entry is a virtual module, so a relative specifier resolves against its own
// path and not against the project: `./src/components/Frame` failed to resolve,
// measured on the demo. Story files are already emitted root-absolute, and this
// makes the configuration's imports travel the same way.
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

    // Read from the shape, not from a list of node types. The list was the bug:
    // it named `VariableDeclaration`, then `FunctionDeclaration` and
    // `ClassDeclaration`, then `TSEnumDeclaration`, then `TSModuleDeclaration`,
    // then `TSImportEqualsDeclaration`, one per review, each accepted until
    // named. Every form that binds a name carries it in `id` or `declarations`,
    // and nothing else at the top level of a module does.
    for (const name of bindings(one['id'] as Node | undefined)) found.add(name)

    for (const declarator of (one['declarations'] as Node[]) ?? []) {
      for (const name of bindings(declarator['id'] as Node | undefined)) found.add(name)
    }
  }

  hoisted(body, found)

  return found
}

// A `var` belongs to the file or to the function, never to the block it sits
// in: `{ var runtime = 'react' }` declares `runtime` for everything after it.
// Read statement by statement, it looked undeclared and the name left pending
// towards the browser. Measured.
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

// Every name a binding position holds, read from the shape rather than from a
// list of pattern types. That list was the same mistake as the one above, a
// level down: `namespace runtime.deep` holds `runtime` in a qualified name, and
// it read nothing. Measured.
//
// What is not a binding is skipped rather than tolerated, because this is read
// in two senses that do not forgive the same error. For `declared`, a name too
// many refuses a valid config with a message. For the names a function of the
// expression carries, a name too many drops the import that name needed, so the
// entry emits it dangling: `({ [field]: value }) => value` swallowed `field`,
// which is an expression and never a binding. Measured.
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

// The `TS…` nodes that hold a value, so the only ones the walk enters. The five
// expressions hold it under `expression`, a parameter property under
// `parameter`, an enum member under `initializer`. A `namespace` is left out:
// the configuration loader refuses one nested in an expression, measured, and
// there is no other place for it. Voir docs/internal/architecture.md.
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

// The names an expression takes from outside itself. A string is not one, and
// neither is a name that only sits where a name cannot be read: the key of an
// object written `{ react: true }`, the property of an access written
// `opts.react`. Both made `@vitejs/plugin-react` travel. Measured.
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

interface Node {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

// `export default defineConfig({ … })` or `export default { … }`, and the
// `adapter` property of whichever it is.
function fieldExpression(body: Node[], field: string): Node | undefined {
  const exported = body.find((node) => node.type === 'ExportDefaultDeclaration')
  const declaration = exported?.['declaration'] as Node | undefined
  const object =
    declaration?.type === 'CallExpression'
      ? ((declaration['arguments'] as Node[])[0] as Node | undefined)
      : declaration

  if (object?.type !== 'ObjectExpression') return undefined

  const found = (object['properties'] as Node[]).find(
    (property) =>
      property.type === 'Property' && (property['key'] as Node | undefined)?.['name'] === field,
  )
  return found?.['value'] as Node | undefined
}

// Replaying the last render on a hot update, rather than letting Vite reload the
// page. The entry has no parent to propagate to, so without this every keystroke
// in a component reloads the iframe and remounts the whole tree.
//
// Through the channel, never around it: it owns what was last asked for and the
// reporting that goes with it. Drawing from here left a failing edit throwing
// into this callback, so no `error` reached the shell.
//
// The catalogue does not change here: a file whose stories changed name or count
// makes the server reload the page instead. See docs/internal/architecture.md.
function hot(files: string[]): string[] {
  if (files.length === 0) return []

  const paths = files.map((file) => `/${file}`)

  return [
    'if (import.meta.hot) {',
    `  const ${OWN}paths = ${JSON.stringify(paths)}`,
    '',
    `  import.meta.hot.accept(${OWN}paths, (updated) => {`,
    '    updated.forEach((module, index) => {',
    `      if (module) ${OWN}modules[${OWN}paths[index]] = module`,
    '    })',
    '',
    `    ${OWN}channel.again()`,
    '  })',
    '}',
  ]
}

// The entry, stripped of the types it carries from the configuration. Named
// after a `.ts` file so oxc reads it as TypeScript, and placed in the project so
// its `tsconfig.json` is the one that applies.
async function compiled(
  entry: string,
  root: string,
  dev: ViteDevServer | undefined,
  warn: (one: { message: string }) => void,
) {
  const { code, map, warnings } = await transformWithOxc(
    entry,
    join(root, 'crypte-preview.ts'),
    undefined,
    undefined,
    dev?.config,
    dev?.watcher,
  )

  // Through the plugin context, which keeps the location and the frame, and once
  // per message: the entry is recompiled on every full reload of the preview, so
  // an unsupported `tsconfig` option would print again each time.
  for (const one of warnings ?? []) {
    const message = String(one.message ?? one)
    if (said.has(message)) continue
    said.add(message)
    warn({ ...one, message })
  }

  return { code, map }
}

// The warnings already printed, so a reload does not repeat them.
const said = new Set<string>()

// The preview's entry, written as source and compiled before it is served.
//
// `import.meta.glob` is eager on purpose. The preview holds every story module
// at once, so switching story is a lookup rather than a round trip, and the
// props stay real, functions and elements included, since none of them crosses
// the channel.
export function previewEntry(project: Project, files: string[] = []): string {
  const css = cssEntryOf(project)

  const sources = configSources(project)
  const adapter = required(sources.adapter)
  const { wrap } = sources

  // The executed configuration against the text: a `wrap` reached through a
  // spread is invisible to the reader, so the entry would mount the story
  // without it and say nothing, which is the state this lot removes.
  if (project.config.wrap !== undefined && wrap === undefined) {
    throw new ConfigError(
      'crypte.config.ts declares `wrap` somewhere the preview cannot read, a spread for instance. ' +
        'Write it in place: the preview reads this file, it never runs it.',
    )
  }

  // Named one by one rather than globbed. A glob takes the whole folder, so a
  // file the reader set aside — a missing dependency, a syntax error — brought
  // the entry down at load time: no `createPreviewChannel`, no `ready`, and a
  // shell waiting for a catalogue that never comes. Only the files that produced
  // an entry are imported.
  const imports = files.map(
    (file, index) => `import * as ${OWN}story${index} from ${JSON.stringify(`/${file}`)}`,
  )
  const held = files.map((file, index) => `  ${JSON.stringify(`/${file}`)}: ${OWN}story${index},`)

  return [
    `import { createPreviewChannel as ${OWN}channelOf, propsOfStory as ${OWN}propsOf, wrapsOf as ${OWN}wrapsOf } from '@crypte/core/preview'`,
    // Deduplicated across the two fields: `adapter` and `wrap` can come from the
    // same `import`, and emitting it twice is a `SyntaxError: Identifier … has
    // already been declared`. The preview then never loads, so no story renders
    // at all. Measured, and the demo misses it: its two names come from two
    // files.
    ...new Set([...adapter.imports, ...(wrap?.imports ?? [])]),
    ...imports,
    ...(css ? [`import ${JSON.stringify(css)}`] : []),
    '',
    `const ${OWN}modules = {\n${held.join('\n')}\n}`,
    `const ${OWN}manifest = await fetch(${JSON.stringify(MANIFEST_ROUTE)}).then((answer) => answer.json())`,
    '',
    `const ${OWN}adapter = ${adapter.expression}`,
    // The global wrap of section 2.5, read from the text like the adapter: the
    // preview cannot import this file, it would run the project's Vite plugins
    // in the browser.
    `const ${OWN}wrap = ${wrap?.expression ?? 'undefined'}`,
    '',
    `const ${OWN}container = document.getElementById('root')`,
    `if (!${OWN}container) throw new Error('preview container not found')`,
    '',
    '// An entry carries the path of its story file, so finding its module is a',
    '// lookup and never a guess about a name. Stories only: the manifest carries',
    '// other natures, and this frame renders one.',
    `const ${OWN}byId = new Map(`,
    `  ${OWN}manifest.entries`,
    `    .filter((entry) => entry.type === 'story')`,
    '    .map((entry) => [entry.id, entry]),',
    ')',
    '',
    `function ${OWN}render(id, overrides) {`,
    `  const entry = ${OWN}byId.get(id)`,
    '  if (!entry) throw new Error(`unknown story: ${id}`)',
    '',
    `  const module = ${OWN}modules[\`/\${entry.storyFile}\`]`,
    '  if (!module) throw new Error(`no module for ${entry.storyFile}`)',
    '',
    '  // The module holds the component and its definition, never a component',
    '  // on its own: mounting `module.default` handed React an object, and the',
    '  // story rendered nothing. Measured in a browser.',
    '  const { component, definition } = module.default',
    '',
    `  const props = ${OWN}propsOf(definition, entry.name, overrides)`,
    '',
    '  // The wrappers last: the adapter nests them, outermost first, and the',
    '  // global one of section 2.5 comes from the configuration text.',
    `  ${OWN}adapter.mount(${OWN}container, component, props, ${OWN}wrapsOf(${OWN}wrap, definition))`,
    '}',
    '',
    `const ${OWN}channel = ${OWN}channelOf({ render: ${OWN}render })`,
    '',
    ...hot(files),
  ].join('\n')
}
