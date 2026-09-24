// The two pages `crypte dev` serves, and where each comes from.

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sirv from 'sirv'
import { transformWithOxc, type Plugin, type ViteDevServer } from 'vite'
import { ConfigError } from './errors'
import { storyFilesOf, type Catalogue } from './manifest'
import { cssEntryOf, type Project } from './project'
import { configSources, required } from './config-source'

// Walks up to `package.json` rather than resolving from this file, which sits in
// `src/` before the build and in `dist/` after it.
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
// a path, and every import inside it resolves against a folder that does not exist.
const VIRTUAL = '\0'

// The id the module graph knows the entry by. Exported so a rebuild can
// invalidate it: nothing imports the entry, so nothing propagates to it.
export const PREVIEW_ENTRY_ID = `${VIRTUAL}${PREVIEW_ENTRY}`

// Where the shell reads the catalogue. Served from memory rather than from
// `.crypte/manifest.json`: that file is an artefact, and reading it back would
// show a stale catalogue whenever a write failed.
export const MANIFEST_ROUTE = '/@crypte/manifest.json'

export const PREVIEW_PAGE = '/preview.html'

function shellAssets(): string {
  if (!existsSync(join(SHELL, 'index.html'))) {
    throw new ConfigError(
      'This @crypte/cli was published without its shell, so `crypte dev` has no page to serve. ' +
        'Reinstall the package, and report it: https://github.com/alexbrndl/crypte/issues. ' +
        'Working in the repository itself? Run `vp run -r pack` at its root.',
    )
  }

  return SHELL
}

// One plugin for both pages: `sirv` serves the prebuilt shell, the middleware
// below builds the preview. Neither is a file in the project: they belong to the
// CLI, and writing them into the project would leave behind something nobody
// asked for.
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

    // `custom`, not `spa`: Vite's `spa` fallback rewrites every unknown URL to
    // `/index.html`, so `/preview.html` and the manifest get the shell's page.
    config() {
      return {
        appType: 'custom',
        // Without this alias the preview asks the user's project for
        // `@crypte/core`, which it never installed. Section 1.4 of docs/contracts.md.
        resolve: { alias: { '@crypte/core/preview': channelPath() } },
      }
    },

    configureServer(server) {
      dev = server

      // The shell in full, its page and its `/assets/…`, served from where they
      // were copied. Vite is rooted in the project, which knows nothing of them:
      // without this the page loads and its bundle answers 404. Measured, blank
      // screen.
      //
      // This also answers `/` and `/index.html`, by sirv's own `extensions`
      // default. The shell is served as a file, so it never passes through
      // `transformIndexHtml` and takes no Vite client: the whole difference with
      // the preview below. Vite's HTML middleware, the only one that injects the
      // client, is not mounted under `custom`, which this plugin sets; under `spa`
      // it would run after every plugin middleware. Either way sirv answers first.
      server.middlewares.use(sirv(shell, { dev: true, etag: true }))

      // Before Vite's own middlewares rather than after. The fallback above is
      // gone, but the order is still where these routes are claimed.
      server.middlewares.use((request, response, next) => {
        const url = (request.url ?? '/').split('?')[0]!

        if (url === MANIFEST_ROUTE) {
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify(current().manifest))
          return
        }

        if (url !== PREVIEW_PAGE) {
          next()
          return
        }

        server
          .transformIndexHtml(url, previewHtml())
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

      // Compiled here: a virtual module is not transformed by its extension, and
      // the entry copies the configuration's TypeScript expression verbatim.
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

function previewHtml(): string {
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
const OWN = '__crypte_'

// The entry has no parent to propagate to: without this, every keystroke in a
// component reloads the iframe and remounts the tree. Replayed through the
// channel, never from here, so a failing edit reaches the shell as an `error`.
function hot(files: string[]): string[] {
  if (files.length === 0) return []

  const paths = files.map((file) => `/${file}`)

  return [
    'if (import.meta.hot) {',
    `  const ${OWN}paths = new Set(${JSON.stringify(paths)})`,
    '',
    '  // Accepted whole. A story file that React cannot refresh sends Vite back to',
    '  // this module, which then runs again rather than reloading the frame.',
    '  import.meta.hot.accept()',
    '',
    '  // Each module an update touched, imported again here with its own',
    '  // timestamp. Vite says nothing when a module fails to reload: it keeps the',
    '  // old one, and the shell showed the version before the edit as rendered.',
    '  // A failure is kept and thrown at the next render, a success forgets it.',
    '  // This entry is left out: importing it again would run it a second time.',
    `  import.meta.hot.on('vite:afterUpdate', async ({ updates }) => {`,
    '    const touched = updates.filter(',
    `      (one) => one.type === 'js-update' && one.path !== ${JSON.stringify(PREVIEW_ENTRY)},`,
    '    )',
    '    if (touched.length === 0) return',
    '',
    '    await Promise.all(',
    '      touched.map((one) =>',
    '        import(/* @vite-ignore */ `${one.path}?t=${one.timestamp}`).then(',
    '          (module) => {',
    `            ${OWN}stale.delete(one.path)`,
    `            if (!${OWN}paths.has(one.path)) return`,
    `            ${OWN}modules[one.path] = module`,
    `            delete ${OWN}broken[one.path]`,
    '          },',
    '          (error) => {',
    `            if (${OWN}paths.has(one.path)) ${OWN}broken[one.path] = error`,
    `            else ${OWN}stale.set(one.path, error)`,
    '          },',
    '        ),',
    '      ),',
    '    )',
    '',
    '    // A story file that failed because of another module stays broken, and',
    '    // nothing touches its file once that module is repaired. Each one is tried',
    '    // again, under a new timestamp so the browser does not return the failure.',
    `    const waiting = Object.keys(${OWN}broken).filter((path) => !touched.some((one) => one.path === path))`,
    '    await Promise.all(',
    '      waiting.map((path) =>',
    '        import(/* @vite-ignore */ `${path}?t=${Date.now()}`).then(',
    '          (module) => {',
    `            ${OWN}modules[path] = module`,
    `            delete ${OWN}broken[path]`,
    '          },',
    '          (error) => {',
    `            ${OWN}broken[path] = error`,
    '          },',
    '        ),',
    '      ),',
    '    )',
    '',
    `    ${OWN}channel.again()`,
    '  })',
    '',
    '  // Vite reports a module it could not load on this event, which can arrive',
    '  // after the render that failed on it: rendering again lets the shell read',
    '  // the file at fault instead of the story file.',
    `  import.meta.hot.on('vite:error', () => ${OWN}channel.again())`,
    '',
    '  // Running again builds a new channel and a new adapter. The old ones go',
    '  // first: left behind, the old channel still answers the shell and the old',
    '  // root still holds the container, so each save leaked one of each.',
    '  // `unmount` is optional: the contract does not require it of an adapter.',
    '  import.meta.hot.dispose(() => {',
    `    ${OWN}channel.dispose()`,
    `    ${OWN}adapter.unmount?.()`,
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
// Every story module is held at once, so switching story is a lookup rather
// than a round trip, and the props stay real, functions and elements included,
// since none of them crosses the channel.
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
  //
  // One promise each, not a static `import`: discovery reads story files without
  // running them, so a file that throws at import is only found here, and a
  // static import would take the whole entry down. The specifier stays a
  // literal, or Vite drops these files from its module graph.
  const loads = files.map((file) => {
    const path = JSON.stringify(`/${file}`)

    return `  import(${path}).then((module) => { ${OWN}modules[${path}] = module }, (error) => { ${OWN}broken[${path}] = error }),`
  })

  return [
    `import { createPreviewChannel as ${OWN}channelOf, propsOfStory as ${OWN}propsOf, wrapsOf as ${OWN}wrapsOf } from '@crypte/core/preview'`,
    // `adapter` and `wrap` can come from the same `import`, and emitting it twice
    // is a `SyntaxError: Identifier … has already been declared`.
    ...new Set([...adapter.imports, ...(wrap?.imports ?? [])]),
    ...(css ? [`import ${JSON.stringify(css)}`] : []),
    '',
    `const ${OWN}modules = {}`,
    // What a story file threw at import, kept by path. Read by `render`, so the
    // channel reports it as that story's error rather than as a dead frame.
    `const ${OWN}broken = {}`,
    // Any other module that failed to reload, kept by path until it reloads.
    `const ${OWN}stale = new Map()`,
    // What Vite could not transform or resolve, by module path, with its file
    // and line. A component that does not load only rejects an import with
    // `Failed to fetch dynamically imported module`, which named a sound story
    // file; Vite says which module failed, on `vite:error`. Listened to before
    // the loads, so a failure at start-up is caught too. An update clears the
    // modules it names, its boundary and the module it accepted, and a module
    // that still fails comes back on `vite:error`. A module that is not its own
    // boundary, a plain `.ts` imported by a component, is named by neither, so
    // its error can outlive its fix. The single-failure naming below then names
    // nothing, or, if that stale error is alone and a fetch fails with no
    // `vite:error` (Vite's 504 on an outdated optimised dependency), names the
    // repaired file. Rare, dev only, and cleared by the next reload.
    `const ${OWN}loadErrors = new Map()`,
    'if (import.meta.hot) {',
    `  import.meta.hot.on('vite:error', ({ err }) => { ${OWN}loadErrors.set(${OWN}modulePath(err.id ?? err.loc?.file ?? ''), err) })`,
    `  import.meta.hot.on('vite:beforeUpdate', ({ updates }) => { for (const one of updates) { ${OWN}loadErrors.delete(one.path); ${OWN}loadErrors.delete(one.acceptedPath) } })`,
    '}',
    ...(loads.length > 0 ? ['', `await Promise.all([`, ...loads, `])`] : []),
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
    `function ${OWN}modulePath(id) {`,
    `  return '/' + String(id).split('?')[0].replace(${JSON.stringify(`${project.root}/`)}, '')`,
    '}',
    '',
    '// A failed fetch of a module, told by the error Vite reported for that very',
    "// module: the browser's message carries its URL. The fetch of a story file",
    '// fails for a module it imports, which the URL does not say, so a file is',
    '// named then only when a single module is failing. Otherwise the failure',
    '// stays as it is, rather than name a file that may be sound.',
    `function ${OWN}named(failure) {`,
    "  const prefix = 'Failed to fetch dynamically imported module:'",
    '  if (!(failure instanceof TypeError) || !failure.message.startsWith(prefix)) return failure',
    '  const url = failure.message.slice(prefix.length).trim()',
    `  const err = ${OWN}loadErrors.get(new URL(url, location.href).pathname) ?? (${OWN}loadErrors.size === 1 ? [...${OWN}loadErrors.values()][0] : undefined)`,
    '  if (!err) return failure',
    `  const root = ${JSON.stringify(`${project.root}/`)}`,
    "  const file = String(err.id ?? err.loc?.file ?? '').replace(root, '')",
    '  const at = err.loc ? `${file}:${err.loc.line}:${err.loc.column}` : file',
    "  const [first = '', ...frame] = String(err.message).split('\\n')",
    "  const named = new Error(`${at}: ${first.replace(`${err.id}: `, '').replaceAll(root, '')}`)",
    "  named.stack = frame.join('\\n').trim()",
    '  return named',
    '}',
    '',
    `function ${OWN}render(id, overrides) {`,
    `  const entry = ${OWN}byId.get(id)`,
    '  if (!entry) throw new Error(`unknown story: ${id}`)',
    '',
    `  const ${OWN}path = \`/\${entry.storyFile}\``,
    '',
    '  // Thrown here rather than swallowed: the channel turns it into an `error`',
    "  // carrying this story's id, which is what names the file at fault.",
    `  const ${OWN}failure = ${OWN}broken[${OWN}path]`,
    `  if (${OWN}failure) throw ${OWN}named(${OWN}failure)`,
    '',
    '  // A module that failed to reload leaves its old version in place, and this',
    '  // frame cannot tell which stories use it: until it reloads, none renders.',
    `  for (const failed of ${OWN}stale.values()) throw ${OWN}named(failed)`,
    '',
    `  const module = ${OWN}modules[${OWN}path]`,
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
