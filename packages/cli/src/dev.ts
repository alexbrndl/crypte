// `crypte dev`: reads the project, writes the catalogue, serves both pages, and
// keeps them in step with the files. See docs/internal/architecture.md.

import { join } from 'node:path'
import { readFileSync, watch, type FSWatcher } from 'node:fs'
import { createServer, type ViteDevServer } from 'vite'
import { fingerprintOf, writeFingerprint } from './fingerprint'
import { buildCatalogue, writeCatalogue, type Catalogue } from './manifest'
import { loadProject, viteConfigOf, type Project } from './project'
import { configPackages, servePlugin, PREVIEW_ENTRY_ID, PREVIEW_PAGE } from './serve'

export interface Started {
  server: ViteDevServer
  project: Project
  // What the server reads now, not what it read at startup: a rebuild replaces
  // it, and a caller holding the value would keep reading the old one.
  held: Held
  // Why the manifest and the fingerprint could not be written, when they could
  // not. Serving does not depend on them.
  written: string | undefined
  // Closes the file watchers this registered, without going through the server:
  // see the comment where they are collected.
  unwatch: () => void
  // What the watched files held when this read them. Compared by `dev` to decide
  // whether a change is still pending: taken after the server is up, an edit
  // landing during the start was compared against itself and lost. Measured.
  read: string
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
  onConfig?: () => void,
  again = false,
): Promise<Started> {
  const project = await loadProject(input)
  const read = digest(project)
  const held: Held = { catalogue: buildCatalogue(project) }

  // Written before the server starts. They are artefacts, so a failure to write
  // them is not a reason to refuse to serve: a read-only checkout, or a folder
  // somebody's tooling holds, would otherwise stop the whole command on an
  // `EACCES` trace.
  //
  // At startup only. The fingerprint is a committed lock file, so rewriting it
  // on every save would dirty the working tree while the author is still
  // typing, including on the half-written states of a rename.
  //
  // Nothing on a restart: `dev` writes after the swap, so a restart that does
  // not complete leaves the file describing what is actually served.
  const written = again ? undefined : write(project.root, held.catalogue, true)

  const config = viteConfigOf(project)

  // The configuration's own packages are pre-bundled: a linked workspace package
  // served as a graph module keeps stale dependency URLs across a
  // re-optimisation, and the preview then loads four generations at once.
  // Measured, `DCJ-221`. See docs/internal/architecture.md.
  const server = await createServer({
    ...config,
    optimizeDeps: { ...config.optimizeDeps, include: configPackages(project) },
    plugins: [...(config.plugins ?? []), servePlugin(project, () => held.catalogue)],
  })

  // Returned rather than left to the server's `close`: Vite resolves that close
  // without emitting `'close'` when the server never listened, so a server built
  // and then abandoned kept its watchers for ever, and each leaked set doubled
  // the restarts of every save that followed. Read in Vite 8.2.1's own source.
  const watching = [
    watchStories(server, project, held, log),
    watchConfig(server, project, () => onConfig?.()),
  ].flat()

  // The digest of what this read, not of what the files hold once the server is
  // up: an edit landing in between was compared against a state nobody had read,
  // and was dropped for ever. Measured.
  return {
    server,
    project,
    held,
    written,
    read,
    unwatch: () => {
      for (const one of watching) one.close()
    },
  }
}

// What the shell and the preview's entry read from the catalogue: the tree, the
// file each entry comes from, and what the reader had to set aside. Props and
// meta are deliberately out, so that editing a story's props stays a hot update
// instead of a page reload.
//
// `partial` and `skipped` are in because the shell only reads them on `ready`,
// which a reload emits: without them here, adding a broken story file or a
// spread showed nothing until a manual reload. Measured, `DCJ-217`. They cost
// no reload on an ordinary edit: changing a prop's value leaves both untouched.
function shape(catalogue: Catalogue): string {
  return JSON.stringify([
    catalogue.manifest.entries.map((entry) => [
      entry.id,
      entry.name,
      entry.path,
      entry.storyFile,
      entry.partial,
    ]),
    catalogue.skipped,
  ])
}

// A story file changed: read the catalogue again, and reload the preview when
// what it reads changed. A component is Vite's business, not ours.
function watchStories(
  server: ViteDevServer,
  project: Project,
  held: Held,
  log: (line: string) => void,
): FSWatcher[] {
  let pending: ReturnType<typeof setTimeout> | undefined

  // What the last build left out, held apart from the catalogue: a skipped file
  // leaves the shape untouched, so comparing catalogues repeated the same line
  // on every keystroke. Measured.
  //
  // Seeded from the start-up build, whose lines `dev` has already printed, and
  // replaced at each build rather than grown: kept for ever, a file broken then
  // fixed then broken again the same way said nothing the second time.
  let said = new Set(lines(held.catalogue))

  // The last failure said. During a conversion, every save of every story file
  // fails the same way, and repeating it buries what follows.
  let failed: string | undefined

  const rebuild = (): void => {
    let next: Catalogue
    try {
      next = buildCatalogue(project, held.catalogue)
    } catch (error) {
      // A half-written file is an ordinary state while typing: two stories
      // briefly share a name, an import is half deleted. Keeping the last good
      // catalogue is the difference between a save that flickers and a server
      // that stops.
      //
      // Said, though. Swallowed, it leaves an author in front of a tree that
      // stopped moving with no idea their file is the reason.
      const line = `the catalogue could not be rebuilt, keeping the last good one: ${reason(error)}`
      if (line !== failed) log(line)
      failed = line
      return
    }

    // What a story file stopped producing, and why. Only what is new since the
    // build before: repeating the whole list on every keystroke would bury it.
    failed = undefined

    const now = lines(next)
    for (const line of now) if (!said.has(line)) log(line)
    said = new Set(now)

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

  // Our own watcher, on the folder we were given. Vite's only covers the files
  // in its module graph, so a story file no page had requested yet never
  // reported a change: on Linux `add` and `unlink` arrived and `change` did not,
  // and on macOS the whole folder happens to be watched so the hole is
  // invisible. Measured in continuous integration.
  //
  // Watching the folder ourselves also removes every question about the path: no
  // filter, no separator, no real path behind a symlink. Every event is already
  // inside it.
  const watcher = watch(join(project.root, project.config.stories), { recursive: true }, () => {
    // One save fires several events. Rebuilding on each would read the tree
    // three times for nothing.
    clearTimeout(pending)
    pending = setTimeout(rebuild, 20)
  })

  server.httpServer?.on('close', () => watcher.close())

  return [watcher]
}

// `crypte.config.ts` and what it imports. Reloading it means rebuilding the
// server, since the project's own plugins come from there: out of this lot, and
// a line is what turns a silence into an instruction.
function watchConfig(server: ViteDevServer, project: Project, changed: () => void): FSWatcher[] {
  // One watcher per file rather than a filter on a folder's events: the list is
  // short, and it says exactly what is watched.
  //
  // `watch` throws on a file that is not there. `project.watch` names what the
  // configuration depends on, and a project may declare a `tsconfig.json` it
  // does not have: skipped rather than fatal.
  let pending: ReturnType<typeof setTimeout> | undefined

  const watchers = project.watch.flatMap((file) => {
    try {
      return [
        watch(file, () => {
          // One save fires several events, as for the stories: restarting on
          // each rebuilt the server twice per keystroke. Measured.
          clearTimeout(pending)
          pending = setTimeout(changed, 20)
        }),
      ]
    } catch {
      return []
    }
  })

  server.httpServer?.on('close', () => {
    for (const one of watchers) one.close()
  })

  return watchers
}

// The watched files as they are on disk. Their content and not their mtime: an
// editor that saves without changing anything must not cost a server.
function digest(project: Project): string {
  return project.watch
    .map((file) => {
      try {
        return `${file}:${readFileSync(file, 'utf8')}`
      } catch {
        return `${file}:absent`
      }
    })
    .join('\u0000')
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// The two artefacts, and what stopped them. Reported rather than thrown: the
// shell reads the catalogue from memory, so a build that cannot write still
// serves everything.
function write(root: string, catalogue: Catalogue, fingerprint: boolean): string | undefined {
  try {
    // The manifest is an artefact the shell may read, so it follows the
    // catalogue and is written on a restart too: left behind, the file on disk
    // and the one served drifted apart for the rest of the session with nothing
    // to say so.
    writeCatalogue(root, catalogue.manifest)

    // The fingerprint is committed, so it is written at start-up only: rewriting
    // it on each valid edit of the configuration would dirty the working tree
    // while the author tries out a `stories` path.
    if (fingerprint) writeFingerprint(root, fingerprintOf(catalogue.manifest))

    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

// The lines a catalogue's skipped files make, in the shape `reported` prints.
function lines(catalogue: Catalogue): string[] {
  return catalogue.skipped.map(({ file, reason: why }) => `  ${file} : ${why}`)
}

// What a story file did not produce, and why. One line each, before the
// server's address: a story its author wrote and the reader could not read must
// not vanish in silence. The in-app version is DCJ-217.
export function reported(catalogue: Catalogue): string[] {
  return lines(catalogue)
}

// What `dev` hands back. A restart replaces the server, so the caller is given a
// handle rather than the first one: closing that first one left the replacement
// listening, and the next start took another port. Measured.
export interface Running {
  readonly server: ViteDevServer
  close: () => Promise<void>
}

export async function dev(input: string, log = console.log): Promise<Running> {
  // Held in a box because a restart replaces it: the caller keeps the first
  // server, so it is this box, and not the caller, that knows the current one.
  const running: { started?: Started } = {}

  // Reading the configuration again is what `server.restart()` of Vite cannot
  // do: ours is read by `loadProject`, outside Vite, and the serve plugin
  // captures the project. Aliases, the CSS entry, the adapter and the user's own
  // plugins all come from there. Voir docs/internal/architecture.md.
  //
  // The new server is built **before** the old one closes: a half-written
  // configuration throws here and leaves the running server alone, which is the
  // same rule the catalogue's rebuild follows. Closing last also hands the port
  // over with nothing in between, so the browser reconnects on its own.
  let seen: string | undefined
  let closed = false

  const once = async () => {
    if (closed) return

    // What the watched files hold now, compared with what the running server
    // read. Compared rather than trusted: one save fires several events, and an
    // editor touches the mtime of files it has not changed. A duplicate costs a
    // whole server, so the debounce alone was not enough, measured.
    const now = digest(running.started?.project ?? started.project)
    if (now === seen) return

    let next: Started

    try {
      next = await startDev(input, log, restart, true)
    } catch (error) {
      // Named for what it is: the throw can come from the configuration, from a
      // `stories` folder that is not there, or from one of the user's own
      // plugins. And a file the new configuration imports is not watched yet, so
      // the way out is another save of `crypte.config.ts` itself.
      log(
        `the configuration could not be read, keeping the server that runs: ${reason(error)}. ` +
          'Save crypte.config.ts again to retry.',
      )
      seen = now
      return
    }

    // `next.read`, the digest of the new server's own watch list: `now` was taken
    // over the **old** list, so as soon as an edit changed the configuration's
    // imports the two could not be equal and the duplicate events of that one
    // save restarted a second time, measured. What `read` can miss, a save that
    // landed while the configuration bundled, is caught below instead.
    seen = next.read

    // The port of the server that runs, held across the restart: without it the
    // search starts from 5173 again, so a server that had fallen back to 5174
    // moved under the open tab. And the URLs are printed again, since they are
    // the only place that says where to look.
    const before = running.started ?? started
    const port = before.server.config.server.port

    // The one way out of a restart that does not complete, whatever the reason:
    // the watchers go first, since Vite resolves the close of a server that
    // never listened without emitting anything, so they would outlive it and
    // double every restart that follows.
    const abandon = async (error?: unknown) => {
      next.unwatch()
      await next.server.close().catch(() => undefined)
      if (error !== undefined) {
        log(`the server could not be restarted, run \`crypte dev\` again: ${reason(error)}`)
      }
    }

    // Checked before touching anything: `close` may have been called while the
    // configuration was loading, and the new server must not outlive it.
    if (closed) {
      await abandon()
      return
    }

    try {
      await before.server.close()
    } catch (error) {
      // The handle is left alone: the old server still holds the port and still
      // answers, so dropping it would leave nothing able to close it.
      await abandon(error)
      return
    }

    running.started = next

    try {
      await next.server.listen(port)
    } catch (error) {
      running.started = undefined
      await abandon(error)
      return
    }

    // And checked again, because `close` runs while this listens: it closed
    // `running.started`, which is this very server, in concurrence with the
    // `listen` above, and the listen wins. Measured: without this, a port
    // answered four seconds after `close()` had resolved.
    if (closed) {
      running.started = undefined
      await abandon()
      return
    }

    // Written after the swap, not inside `startDev`: a restart that never
    // completed had already rewritten `.crypte/manifest.json`, so the file
    // described a catalogue no server served while the one still standing served
    // the old. That is the divergence this lot exists to remove.
    const failed = write(next.project.root, next.held.catalogue, false)
    if (failed) log(`the manifest could not be written: ${failed}`)

    // What the files hold now, against what the new server read: a save that
    // landed while the configuration bundled is still pending, and this is where
    // it is picked up rather than dropped.
    if (digest(next.project) !== next.read) restart()

    // Everything the start-up says, said again, minus what has not changed: the
    // files left out are compared with the previous server's, since reprinting
    // twenty lines on every save of the configuration buries the one that
    // matters, the rule `watchStories` already follows.
    const dites = reported(next.held.catalogue)
    const avant = reported(before.held.catalogue)
    const fresh = dites.filter((one) => !avant.includes(one))

    if (fresh.length > 0) {
      log(`${fresh.length} story file(s) left out:`)
      for (const line of fresh) log(line)
    }

    log(`crypte.config.ts changed, ${next.held.catalogue.manifest.entries.length} stories`)
    next.server.printUrls()
  }

  // Queued rather than guarded: a restart takes about 40 ms, measured, so a save
  // can land inside one, and between the new server and the old one closing both
  // sets of watchers are live. A chain runs them in order and drops none, and the
  // content check inside makes a queued duplicate a no-op.
  //
  // The `catch` is what keeps the chain alive: rejected once, `then` would never
  // call `once` again and every later save would be dropped in silence, which is
  // also the unhandled rejection this whole shape exists to avoid.
  let queue = Promise.resolve()

  const restart = () => {
    queue = queue.then(once).catch((error: unknown) => log(`the restart failed: ${reason(error)}`))
  }

  const started = await startDev(input, log, restart)
  running.started = started
  seen = started.read

  const { server, held, written } = started

  await server.listen()

  if (written) log(`neither manifest nor fingerprint could be written: ${written}`)

  const dites = reported(held.catalogue)
  if (dites.length > 0) {
    log(`${held.catalogue.skipped.length} story file(s) left out:`)
    for (const line of dites) log(line)
  }

  log(`${held.catalogue.manifest.entries.length} stories`)
  server.printUrls()

  return {
    get server() {
      return running.started?.server ?? server
    },
    close: async () => {
      // Disarmed first: a queued restart, or a debounce already armed, would
      // otherwise build and listen a server after this returned, and the test
      // that closes then deletes its project would leave one behind.
      // Disarmed rather than awaited: `once` checks this flag before it listens,
      // so nothing comes up after this returns, and stopping does not wait on a
      // `loadProject` that a slow import could hold.
      closed = true
      await running.started?.server.close()
    },
  }
}
