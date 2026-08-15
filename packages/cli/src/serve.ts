// The two pages `crypte dev` serves, and where each comes from.
// See docs/decisions.md and docs/internal/architecture.md.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
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
      'The shell is missing from this package. Run `vp run -r pack` at the root of the repository.',
    )
  }

  return SHELL
}

// What a project offers a story reader: the folder to glob, as
// `import.meta.glob` takes it, and the catalogue as it will be served.
export function storiesGlob(project: Project): string {
  return `/${project.config.stories}/**/*.{ts,tsx,js,jsx}`
}

// One plugin for both pages. Neither is a file in the project: they belong to
// the CLI, and writing them into the project would leave behind something
// nobody asked for.
export function servePlugin(project: Project, manifest: string): Plugin {
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
      return id === `${VIRTUAL}${PREVIEW_ENTRY}` ? previewEntry(project) : undefined
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

// The preview's entry, written as source and compiled by the project's Vite.
//
// The adapter comes from the project's own configuration, imported here rather
// than named: guessing a package from `adapter.name` would break the moment
// somebody wraps an adapter, and the configuration already holds the real one.
//
// `import.meta.glob` is eager on purpose. The preview holds every story module
// at once, so switching story is a lookup rather than a round trip, and the
// props stay real, functions and elements included, since none of them crosses
// the channel.
export function previewEntry(project: Project): string {
  const css = cssEntryOf(project)

  return [
    "import { createPreviewChannel } from '@crypte/core/preview'",
    "import config from '/crypte.config.ts'",
    ...(css ? [`import ${JSON.stringify(css)}`] : []),
    '',
    `const modules = import.meta.glob(${JSON.stringify(storiesGlob(project))}, { eager: true })`,
    `const manifest = await fetch(${JSON.stringify(MANIFEST_ROUTE)}).then((answer) => answer.json())`,
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
    '    config.adapter.mount(container, module.default, overrides)',
    '  },',
    '})',
  ].join('\n')
}
