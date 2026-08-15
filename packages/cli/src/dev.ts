// `crypte dev`: reads the project, writes the catalogue, serves both pages, and
// keeps them in step with the files. See docs/internal/architecture.md.

import { join, relative, sep } from 'node:path'
import { realpathSync } from 'node:fs'
import { createServer, type ViteDevServer } from 'vite'
import { fingerprintOf, writeFingerprint } from './fingerprint'
import { buildCatalogue, writeCatalogue, type Catalogue } from './manifest'
import { loadProject, viteConfigOf, type Project } from './project'
import { servePlugin, PREVIEW_ENTRY_ID, PREVIEW_PAGE } from './serve'

export interface Started {
  server: ViteDevServer
  project: Project
  // What the server reads now, not what it read at startup: a rebuild replaces
  // it, and a caller holding the value would keep reading the old one.
  held: Held
  // Why the manifest and the fingerprint could not be written, when they could
  // not. Serving does not depend on them.
  written: string | undefined
}

export interface Held {
  catalogue: Catalogue
}

// Assembled from the pieces the earlier lots left: `loadProject` for the
// configuration and the aliases, `buildCatalogue` for the stories, and the
// serve plugin for the two pages.
export async function startDev(
  input: string,
  log: (line: string) => void = () => {},
): Promise<Started> {
  const project = await loadProject(input)
  const held: Held = { catalogue: buildCatalogue(project) }

  // Written before the server starts. They are artefacts, so a failure to write
  // them is not a reason to refuse to serve: a read-only checkout, or a folder
  // somebody's tooling holds, would otherwise stop the whole command on an
  // `EACCES` trace.
  //
  // At startup only. The fingerprint is a committed lock file, so rewriting it
  // on every save would dirty the working tree while the author is still
  // typing, including on the half-written states of a rename.
  const written = write(project.root, held.catalogue)

  const config = viteConfigOf(project)
  const server = await createServer({
    ...config,
    plugins: [...(config.plugins ?? []), servePlugin(project, () => held.catalogue)],
  })

  watchStories(server, project, held, log)
  watchConfig(server, project, log)

  return { server, project, held, written }
}

// What the shell and the preview's entry read from the catalogue: the tree, and
// the file each entry comes from. Props and meta are deliberately out, so that
// editing a story's props stays a hot update instead of a page reload.
function shape(catalogue: Catalogue): string {
  return JSON.stringify(
    catalogue.manifest.entries.map((entry) => [entry.id, entry.name, entry.path, entry.storyFile]),
  )
}

// A story file changed: read the catalogue again, and reload the preview when
// what it reads changed. A component is Vite's business, not ours.
function watchStories(
  server: ViteDevServer,
  project: Project,
  held: Held,
  log: (line: string) => void,
): void {
  // Both forms of the same folder, separator included. Chokidar follows links
  // and reports the real path, which `loadProject` does not resolve: behind a
  // symlinked root no event passed the filter and reloading was dead without a
  // word. Measured. Without the separator a sibling `stories-old` would rebuild.
  const roots = watched(join(project.root, project.config.stories) + sep)

  // What was already said, held apart from the catalogue: a skipped file leaves
  // the shape untouched, so comparing catalogues repeated the same line on every
  // keystroke. Measured.
  const said = new Set<string>()

  const rebuild = (file: string): void => {
    if (!roots.some((one) => file.startsWith(one))) return

    let next: Catalogue
    try {
      next = buildCatalogue(project)
    } catch (error) {
      // A half-written file is an ordinary state while typing: two stories
      // briefly share a name, an import is half deleted. Keeping the last good
      // catalogue is the difference between a save that flickers and a server
      // that stops.
      //
      // Said, though. Swallowed, it leaves an author in front of a tree that
      // stopped moving with no idea their file is the reason.
      log(`the catalogue could not be rebuilt, keeping the last good one: ${reason(error)}`)
      return
    }

    // What a story file stopped producing, and why. Only what is new: repeating
    // the whole list on every keystroke would bury it.
    for (const { file: from, reason: why } of next.skipped) {
      const line = `  ${from} : ${why}`
      if (said.has(line)) continue

      said.add(line)
      log(line)
    }

    // Held first, reloaded second. The shape decides whether the frame reloads,
    // never whether the catalogue is current: editing a story's props leaves the
    // shape untouched, and returning here served the props from before the edit.
    // Measured.
    const same = shape(next) === shape(held.catalogue)
    held.catalogue = next

    if (same) return

    // The entry names its imports one by one, so a file added or removed makes
    // it a different module. Vite has no reason to know that: nothing imports
    // the entry, so nothing propagates to it.
    const module = server.moduleGraph.getModuleById(PREVIEW_ENTRY_ID)
    if (module) server.moduleGraph.invalidateModule(module)

    server.hot.send({ type: 'full-reload', path: PREVIEW_PAGE })
  }

  for (const event of ['add', 'change', 'unlink'] as const) {
    server.watcher.on(event, rebuild)
  }
}

// `crypte.config.ts` and what it imports. Reloading it means rebuilding the
// server, since the project's own plugins come from there: out of this lot, and
// a line is what turns a silence into an instruction.
function watchConfig(server: ViteDevServer, project: Project, log: (line: string) => void): void {
  const files = new Set(project.watch.flatMap((file) => watched(file)))

  server.watcher.on('change', (file) => {
    if (files.has(file)) log(`${relative(project.root, file)} changed, restart \`crypte dev\``)
  })
}

// A path as written and as the file system really names it. The two differ as
// soon as a symlink is on the way, and the watcher reports the second.
function watched(path: string): string[] {
  try {
    const real = realpathSync(path.endsWith(sep) ? path.slice(0, -1) : path)

    return [path, path.endsWith(sep) ? real + sep : real]
  } catch {
    // Not there yet, or gone: the written form is all there is.
    return [path]
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// The two artefacts, and what stopped them. Reported rather than thrown: the
// shell reads the catalogue from memory, so a build that cannot write still
// serves everything.
function write(root: string, catalogue: Catalogue): string | undefined {
  try {
    writeCatalogue(root, catalogue.manifest)
    writeFingerprint(root, fingerprintOf(catalogue.manifest))
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

// What a story file did not produce, and why. One line each, before the
// server's address: a story its author wrote and the reader could not read must
// not vanish in silence. The in-app version is DCJ-217.
export function reported(catalogue: Catalogue): string[] {
  return catalogue.skipped.map(({ file, reason }) => `  ${file} : ${reason}`)
}

export async function dev(input: string, log = console.log): Promise<ViteDevServer> {
  const { server, held, written } = await startDev(input, log)

  await server.listen()

  if (written) log(`neither manifest nor fingerprint could be written: ${written}`)

  const lines = reported(held.catalogue)
  if (lines.length > 0) {
    log(`${held.catalogue.skipped.length} story file(s) left out:`)
    for (const line of lines) log(line)
  }

  log(`${held.catalogue.manifest.entries.length} stories`)
  server.printUrls()

  return server
}
