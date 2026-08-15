// The two pages `crypte dev` serves, and where each comes from.
// See docs/decisions.md and docs/internal/architecture.md.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sirv from 'sirv'
import { parseSync, type Plugin } from 'vite'
import { ConfigError } from './errors'
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
export function servePlugin(project: Project, manifest: string, files: string[]): Plugin {
  const shell = shellAssets()

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
          response.end(manifest)
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
      return id === PREVIEW_ENTRY ? `${VIRTUAL}${PREVIEW_ENTRY}` : undefined
    },

    load(id) {
      return id === `${VIRTUAL}${PREVIEW_ENTRY}` ? previewEntry(project, files) : undefined
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
  const file = join(project.root, 'crypte.config.ts')
  const source = readFileSync(file, 'utf8')
  const parsed = parseSync('crypte.config.ts', source)

  if (parsed.errors.length > 0) {
    throw new ConfigError(`crypte.config.ts could not be parsed: ${parsed.errors[0]?.message}`)
  }

  const value = adapterExpression(parsed.program.body as unknown as Node[])
  if (value === undefined) {
    throw new ConfigError(
      'crypte.config.ts must declare `adapter` in the object it exports, written in place.',
    )
  }

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
      `crypte.config.ts hands \`adapter\` a value it builds itself (\`${built}\`). ` +
        'Write the adapter in place, or import it: the preview reads this file, it never runs it.',
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

  const imports = [...needed].map((one) => source.slice(one.start, one.end))

  return { imports, expression: source.slice(value.start, value.end) }
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

    if (one.type === 'VariableDeclaration') {
      for (const declarator of (one['declarations'] as Node[]) ?? []) {
        for (const name of bindings(declarator['id'] as Node | undefined)) found.add(name)
      }
    }

    if (
      one.type === 'FunctionDeclaration' ||
      one.type === 'ClassDeclaration' ||
      one.type === 'TSEnumDeclaration' ||
      one.type === 'TSModuleDeclaration'
    ) {
      for (const name of bindings(one['id'] as Node | undefined)) found.add(name)
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

// The names a binding introduces. `const { a, b: [c] = [] } = …` declares three,
// and reading only the plain `Identifier` case saw none of them. Measured.
function bindings(node: Node | undefined): string[] {
  if (node === undefined) return []

  if (node.type === 'Identifier') return [node['name'] as string]

  if (node.type === 'ObjectPattern') {
    return ((node['properties'] as Node[]) ?? []).flatMap((one) =>
      bindings((one['value'] ?? one['argument']) as Node | undefined),
    )
  }

  if (node.type === 'ArrayPattern') {
    return ((node['elements'] as (Node | null)[]) ?? []).flatMap((one) =>
      bindings(one ?? undefined),
    )
  }

  // The right side of a default is an expression, not a binding.
  if (node.type === 'AssignmentPattern') return bindings(node['left'] as Node | undefined)
  if (node.type === 'RestElement') return bindings(node['argument'] as Node | undefined)

  return []
}

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'])

// The node types that carry their own names, so that a parameter shadowing a
// name of the file does not make the expression look like it uses that name.
const CARRIES = new Set([...FUNCTIONS, 'CatchClause'])

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
    if (inner.type === 'Identifier') {
      const name = inner['name'] as string
      if (!bound.has(name)) found.add(name)
      return
    }

    // `(opts) => opts.react` names nothing of the file, even where the file
    // declares `opts`: the expression brings that name with it.
    const inside = CARRIES.has(inner.type) ? new Set(bound) : bound
    if (inside !== bound) {
      for (const param of (inner['params'] as Node[]) ?? []) {
        for (const name of bindings(param)) inside.add(name)
      }

      for (const name of bindings(inner['param'] as Node | undefined)) inside.add(name)

      const body = inner['body'] as Node | undefined
      if (body?.type === 'BlockStatement') {
        for (const name of declared((body['body'] as Node[]) ?? [])) inside.add(name)
      }
    }

    const fixed =
      inner['computed'] === true
        ? undefined
        : inner.type === 'Property'
          ? 'key'
          : inner.type === 'MemberExpression'
            ? 'property'
            : undefined

    for (const [key, held] of Object.entries(inner)) {
      if (key === fixed) continue
      if (key === 'typeAnnotation') continue
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
function adapterExpression(body: Node[]): Node | undefined {
  const exported = body.find((node) => node.type === 'ExportDefaultDeclaration')
  const declaration = exported?.['declaration'] as Node | undefined
  const object =
    declaration?.type === 'CallExpression'
      ? ((declaration['arguments'] as Node[])[0] as Node | undefined)
      : declaration

  if (object?.type !== 'ObjectExpression') return undefined

  const found = (object['properties'] as Node[]).find(
    (property) =>
      property.type === 'Property' && (property['key'] as Node | undefined)?.['name'] === 'adapter',
  )
  return found?.['value'] as Node | undefined
}

// The preview's entry, written as source and compiled by the project's Vite.
//
// `import.meta.glob` is eager on purpose. The preview holds every story module
// at once, so switching story is a lookup rather than a round trip, and the
// props stay real, functions and elements included, since none of them crosses
// the channel.
export function previewEntry(project: Project, files: string[] = []): string {
  const css = cssEntryOf(project)

  const adapter = adapterSource(project)

  // Named one by one rather than globbed. A glob takes the whole folder, so a
  // file the reader set aside — a missing dependency, a syntax error — brought
  // the entry down at load time: no `createPreviewChannel`, no `ready`, and a
  // shell waiting for a catalogue that never comes. Only the files that produced
  // an entry are imported.
  const imports = files.map(
    (file, index) => `import * as story${index} from ${JSON.stringify(`/${file}`)}`,
  )
  const held = files.map((file, index) => `  ${JSON.stringify(`/${file}`)}: story${index},`)

  return [
    "import { createPreviewChannel, propsOfStory } from '@crypte/core/preview'",
    ...adapter.imports,
    ...imports,
    ...(css ? [`import ${JSON.stringify(css)}`] : []),
    '',
    `const modules = {\n${held.join('\n')}\n}`,
    `const manifest = await fetch(${JSON.stringify(MANIFEST_ROUTE)}).then((answer) => answer.json())`,
    '',
    `const adapter = ${adapter.expression}`,
    '',
    "const container = document.getElementById('root')",
    "if (!container) throw new Error('preview container not found')",
    '',
    '// An entry carries the path of its story file, so finding its module is a',
    '// lookup and never a guess about a name.',
    'const byId = new Map(manifest.entries.map((entry) => [entry.id, entry]))',
    '',
    'createPreviewChannel({',
    '  render(id, overrides) {',
    '    const entry = byId.get(id)',
    '    if (!entry) throw new Error(`unknown story: ${id}`)',
    '',
    '    const module = modules[`/${entry.storyFile}`]',
    '    if (!module) throw new Error(`no module for ${entry.storyFile}`)',
    '',
    '    // The module holds the component and its definition, never a component',
    '    // on its own: mounting `module.default` handed React an object, and the',
    '    // story rendered nothing. Measured in a browser.',
    '    const { component, definition } = module.default',
    '',
    '    adapter.mount(',
    '      container,',
    '      component,',
    '      propsOfStory(definition, entry.name, overrides),',
    '    )',
    '  },',
    '})',
  ].join('\n')
}
