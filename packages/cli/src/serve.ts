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

  const expression = adapterExpression(parsed.program.body as unknown as Node[], source)
  if (expression === undefined) {
    throw new ConfigError(
      'crypte.config.ts must declare `adapter` in the object it exports, written in place.',
    )
  }

  // Only the imports the expression names. Carrying the others would put back
  // exactly what reading rather than importing was meant to leave out.
  const imports = (parsed.module.staticImports as unknown as Node[])
    .filter((one) =>
      ((one['entries'] as Node[]) ?? []).some((entry) =>
        names(expression).has((entry['localName'] as Node)['value'] as string),
      ),
    )
    .map((one) => source.slice(one.start, one.end))

  return { imports, expression }
}

interface Node {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

// The identifiers an expression writes, as words. A word test is enough here:
// the expression is a call or a name, and a false match would only carry one
// import too many.
function names(expression: string): Set<string> {
  return new Set(expression.match(/[A-Za-z_$][\w$]*/g) ?? [])
}

// `export default defineConfig({ … })` or `export default { … }`, and the
// `adapter` property of whichever it is.
function adapterExpression(body: Node[], source: string): string | undefined {
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
  const value = found?.['value'] as Node | undefined

  return value ? source.slice(value.start, value.end) : undefined
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
  const imports = files.map((file, index) => `import * as story${index} from '/${file}'`)
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
