// `crypte dev`: reads the project, writes the catalogue, serves both pages, and
// keeps them in step with the files.

import { join } from 'node:path'
import { readFileSync, watch, type FSWatcher } from 'node:fs'
import { createServer, type ViteDevServer } from 'vite'
import { reason } from './errors'
import { FINGERPRINT, fingerprintOf, writeFingerprint } from './fingerprint'
import { buildCatalogue, storiesOf, writeCatalogue, type Catalogue } from './manifest'
import { loadProject, viteConfigOf, type Project } from './project'
import { configPackages } from './config-source'
import { servePlugin, PREVIEW_ENTRY_ID, PREVIEW_PAGE } from './serve'

// What `dev` closes when it stops watching. An `FSWatcher` satisfies it, and so
// does the set of component watchers, which is replaced at every build and so
// cannot be handed over as a single watcher.
interface Closer {
  close(): void
}

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
  // The component files watched right now. A seam for the cases: whether the set
  // follows the catalogue or was fixed at start-up is otherwise only visible in
  // the timing of filesystem events, which no case can hold.
  watched: () => string[]
  // What the watched files held when this read them. Compared by `dev` to decide
  // whether a change is still pending: taken after the server is up, an edit
  // landing during the start was compared against itself and lost. Measured.
  read: string
}

interface Held {
  catalogue: Catalogue
}

// Assembled from the pieces the earlier lots left: `loadProject` for the
// configuration and the aliases, `buildCatalogue` for the stories, and the
// serve plugin for the two pages.
export async function startDev(
  input: string,
  log: (line: string) => void = () => {},
  onConfig?: () => void,
  // The previous server's catalogue, on a restart: it carries `wasStory`, so a
  // file that stopped producing keeps its banner. Its presence is what says this
  // is a restart, where a flag beside it could disagree with it.
  before?: Catalogue,
): Promise<Started> {
  const project = await loadProject(input)
  const read = digest(project)
  const held: Held = { catalogue: buildCatalogue(project, before) }

  // Nothing on a restart: `dev` writes after the swap, so a restart that does not
  // complete leaves the file describing what is actually served.
  const written = before ? undefined : write(project.root, held.catalogue)

  const config = viteConfigOf(project)

  // Pre-bundled: a linked workspace package served as a graph module keeps stale
  // dependency URLs across a re-optimisation.
  const server = await createServer({
    ...config,
    optimizeDeps: { ...config.optimizeDeps, include: configPackages(project) },
    plugins: [...config.plugins, servePlugin(project, () => held.catalogue)],
  })

  // Returned rather than left to the server's `close`: Vite resolves that close
  // without emitting `'close'` when the server never listened, leaking the watchers.
  const stories = watchStories(server, project, held, log)
  const watching = [...stories.closers, ...watchConfig(server, project, () => onConfig?.())]

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
    watched: stories.watched,
  }
}

// What decides whether the preview reloads. Props and meta are out, so editing a
// story's props stays a hot update; `partial` and `skipped` are in, or a story
// file that just broke shows nothing until a manual reload.
function shape(catalogue: Catalogue): string {
  return JSON.stringify([
    storiesOf(catalogue.manifest).map((entry) => [
      entry.id,
      entry.name,
      entry.path,
      entry.storyFile,
      entry.partial,
    ]),
    catalogue.skipped,
  ])
}

// The component files the catalogue cites, each once, absolute. Watching these
// and not the project is the whole point: a keystroke in any other file would
// otherwise read the tree again. Exported for the case that holds that limit.
export function componentFiles(root: string, catalogue: Catalogue): string[] {
  return [
    ...new Set(storiesOf(catalogue.manifest).map((entry) => join(root, entry.component.file))),
  ].sort()
}

// A story file changed: rebuild the catalogue, reload the preview when what it
// reads changed. Component files are watched too, and the set follows the
// catalogue: a story that changes component moves its watcher.
function watchStories(
  server: ViteDevServer,
  project: Project,
  held: Held,
  log: (line: string) => void,
): { closers: Closer[]; watched: () => string[] } {
  let pending: ReturnType<typeof setTimeout> | undefined

  // One save fires several events, hence the debounce. And once stopped, nothing:
  // a timer armed just before the close rebuilt after it, and `syncComponents`
  // reopened one watcher per component into a map nobody closes.
  let stopped = false

  const soon = (): void => {
    if (stopped) return

    clearTimeout(pending)
    pending = setTimeout(rebuild, 20)
  }

  // What the last build left out, seeded from the start-up build whose lines `dev`
  // has already printed. Replaced at each build, never grown: kept for ever, a file
  // broken then fixed then broken again said nothing the second time.
  let said = new Set(lines(held.catalogue))

  // The last failure said. During a conversion, every save of every story file
  // fails the same way, and repeating it buries what follows.
  let failed: string | undefined

  // The fingerprint on disk, read rather than derived from the catalogue held:
  // a write that failed leaves the file behind, and the next story change then
  // retries. Kept current because `crypte check` fails on a stale one.
  let recorded = recordedFingerprint(project.root)

  const rebuild = (): void => {
    if (stopped) return

    let next: Catalogue
    try {
      next = buildCatalogue(project, held.catalogue)
    } catch (error) {
      // A half-written file is ordinary while typing, so the last good catalogue
      // is kept rather than thrown. Said all the same: silent, the tree stops
      // moving and nothing names the file.
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

    // Held before the `same` return: the shape decides whether the frame reloads,
    // never whether the catalogue is current, and editing props leaves it untouched.
    const same = shape(next) === shape(held.catalogue)
    held.catalogue = next

    const fingerprint = fingerprintOf(next.manifest)
    if (JSON.stringify(fingerprint) !== recorded) {
      try {
        writeFingerprint(project.root, fingerprint)
        recorded = JSON.stringify(fingerprint)
      } catch (error) {
        log(`the fingerprint could not be written: ${reason(error)}`)
      }
    }

    // After `held`, so a watcher that fires during this reads the new
    // catalogue. A story that changed component points at another file now.
    syncComponents(next)

    if (same) return

    // The entry names its imports one by one, so a file added or removed makes
    // it a different module. Vite has no reason to know that: nothing imports
    // the entry, so nothing propagates to it.
    const module = server.moduleGraph.getModuleById(PREVIEW_ENTRY_ID)
    if (module) server.moduleGraph.invalidateModule(module)

    server.hot.send({ type: 'full-reload', path: PREVIEW_PAGE })
  }

  // Our own watcher: Vite's covers only the files in its module graph, so a story
  // file no page has requested yet reports nothing on Linux. macOS watches the
  // whole folder anyway, which hides the hole locally.
  const watcher = watch(join(project.root, project.config.stories), { recursive: true }, soon)

  // One watcher per component file, not a folder: their common ancestor is often
  // the project root. Keyed by path, so a rebuild keeps the ones that did not move.
  const components = new Map<string, FSWatcher>()

  // `fs.watch` on a file follows the inode: an editor that saves atomically kills
  // the watcher, hence the reopen on `rename`. And the last reason each file could
  // not be watched, so a lasting cause is said once and not at every rebuild.
  const unwatchable = new Map<string, string>()

  const watchComponent = (file: string): FSWatcher | undefined => {
    try {
      return watch(file, (type) => {
        if (type === 'rename') reopen(file)

        soon()
      })
    } catch (error) {
      // A file that is not there is ordinary: section 8 says a component reached
      // through a plugin keeps the identifier the story wrote. Anything else is
      // not, and a watcher missing in silence is the failure this lot closes.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Once, and again if the cause changes: `syncComponents` retries every
        // file it does not hold at each rebuild.
        const line = `${file} is not watched, so its props will not refresh: ${reason(error)}`
        if (line !== unwatchable.get(file)) log(line)
        unwatchable.set(file, line)
      }

      return undefined
    }
  }

  // Closed and reopened on the same path, from the watcher's own callback, which
  // Node allows. Guarded like `soon` and `rebuild`: it is a third way to open one.
  const reopen = (file: string): void => {
    if (stopped) return

    components.get(file)?.close()
    components.delete(file)

    const one = watchComponent(file)
    if (one) components.set(file, one)
  }

  const syncComponents = (catalogue: Catalogue): void => {
    const wanted = new Set(componentFiles(project.root, catalogue))

    for (const [file, one] of components) {
      if (wanted.has(file)) continue
      one.close()
      components.delete(file)
      unwatchable.delete(file)
    }

    for (const file of wanted) {
      if (components.has(file)) continue

      const one = watchComponent(file)
      if (one) components.set(file, one)
    }
  }

  // Seeded from the start-up build, like `said` above: without this, the first
  // edit of a component is only picked up after a story file has moved, which
  // is the whole defect.
  syncComponents(held.catalogue)

  const stop = (): void => {
    stopped = true
    clearTimeout(pending)

    for (const one of components.values()) one.close()
    components.clear()
  }

  server.httpServer?.on('close', () => {
    watcher.close()
    stop()
  })

  return {
    closers: [watcher, { close: stop }],
    watched: () => [...components.keys()].sort(),
  }
}

// `crypte.config.ts` and what it imports. Reloading it means rebuilding the
// server, since the project's own plugins come from there: out of this lot, and
// a line is what turns a silence into an instruction.
function watchConfig(server: ViteDevServer, project: Project, changed: () => void): FSWatcher[] {
  // `watch` throws on a file that is not there, and `project.watch` may name a
  // `tsconfig.json` the project declares but does not have: skipped, not fatal.
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

// The committed fingerprint as `JSON.stringify` gives it, or nothing when it is
// missing or unreadable, which any rebuild then replaces.
function recordedFingerprint(root: string): string | undefined {
  try {
    return JSON.stringify(JSON.parse(readFileSync(join(root, FINGERPRINT), 'utf8')))
  } catch {
    return undefined
  }
}

// The two artefacts, and what stopped them. Reported rather than thrown: the
// shell reads the catalogue from memory, so a build that cannot write still
// serves everything.
function write(root: string, catalogue: Catalogue): string | undefined {
  try {
    // Written on a restart too, or the manifest on disk and the catalogue served
    // drift apart for the rest of the session.
    writeCatalogue(root, catalogue.manifest)

    // On a restart too: the fingerprint follows the catalogue served, or keeping
    // a new `stories` path left it behind and `crypte check` failed while
    // `crypte dev` ran. Trying a path and reverting rewrites the same bytes.
    writeFingerprint(root, fingerprintOf(catalogue.manifest))

    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

// Everything a build left out, in the shape the reports below print. Both halves
// together, since this is what `watchStories` compares between two builds and a
// plugin that keeps failing must not repeat its line on every keystroke either.
function lines(catalogue: Catalogue): string[] {
  return [...reported(catalogue), ...refused(catalogue)]
}

// What a story file did not produce, and why. One line each, before the
// server's address: a story its author wrote and the reader could not read must
// not vanish in silence. The in-app version is DCJ-217.
function reported(catalogue: Catalogue): string[] {
  return catalogue.skipped.map(({ file, reason: why }) => `  ${file} : ${why}`)
}

// What a plugin's `entries` hook did not get to contribute. Named by plugin and
// not by file: nothing here is fatal, so the only trace is this line, and it has
// to say which plugin to go and look at. Section 6.3 of docs/contracts.md.
function refused(catalogue: Catalogue): string[] {
  return catalogue.skippedPlugins.map(({ plugin, reason: why }) => `  ${plugin} : ${why}`)
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

  // A full restart, not Vite's `server.restart()`: `loadProject` reads the
  // configuration outside Vite and the serve plugin captures the project. The new
  // server is built before the old one closes, so a throw leaves the running one.
  let seen: string | undefined
  let closed = false

  const once = async () => {
    if (closed) return

    // Compared, not trusted: one save fires several events and a duplicate costs a
    // whole server, which the debounce alone did not prevent.
    const now = digest(running.started?.project ?? started.project)
    if (now === seen) return

    let next: Started

    try {
      next = await startDev(input, log, restart, (running.started ?? started).held.catalogue)
    } catch (error) {
      // A file the new configuration imports is not watched yet, so the only way
      // out is another save of `crypte.config.ts` itself.
      log(
        `the configuration could not be read, keeping the server that runs: ${reason(error)}. ` +
          'Save crypte.config.ts again to retry.',
      )
      seen = now
      return
    }

    // `next.read` and not `now`: `now` was taken over the old watch list, so a
    // change to the configuration's imports restarted the same save twice.
    seen = next.read

    // The port is held across the restart: without it the search starts from 5173
    // again, and a server that had fallen back moves under the open tab.
    const before = running.started ?? started
    const port = before.server.config.server.port

    // The one way out of a restart that does not complete. The watchers go first:
    // closing a server that never listened emits nothing, so they would outlive it.
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

    // Written after the swap: a restart that fails earlier must not leave a
    // manifest describing a catalogue no server serves.
    const failed = write(next.project.root, next.held.catalogue)
    if (failed) log(`the manifest could not be written: ${failed}`)

    // A save that landed while the configuration bundled is still pending: picked
    // up here rather than dropped, and announced by the restart it triggers.
    if (digest(next.project) !== next.read) {
      restart()
      return
    }

    // Only what the previous server did not already say: reprinting the whole list
    // on every save of the configuration buries the line that changed.
    const dites = reported(next.held.catalogue)
    const avant = reported(before.held.catalogue)
    const fresh = dites.filter((one) => !avant.includes(one))

    if (fresh.length > 0) {
      log(`${fresh.length} story file(s) left out:`)
      for (const line of fresh) log(line)
    }

    const refusals = refused(next.held.catalogue).filter(
      (one) => !refused(before.held.catalogue).includes(one),
    )

    if (refusals.length > 0) {
      log(`${refusals.length} plugin contribution(s) refused:`)
      for (const line of refusals) log(line)
    }

    log(`crypte.config.ts changed, ${storiesOf(next.held.catalogue.manifest).length} stories`)
    next.server.printUrls()
  }

  // Queued rather than guarded: a save can land inside a restart and must not be
  // dropped. The `catch` keeps the chain alive: rejected once, `then` would never
  // call `once` again and every later save would go in silence.
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

  const refusals = refused(held.catalogue)
  if (refusals.length > 0) {
    log(`${refusals.length} plugin contribution(s) refused:`)
    for (const line of refusals) log(line)
  }

  log(`${storiesOf(held.catalogue.manifest).length} stories`)
  server.printUrls()

  return {
    get server() {
      return running.started?.server ?? server
    },
    close: async () => {
      // Disarmed **and** awaited: a restart already past the `closed` check races
      // its own `listen`, and the listen wins. The price is that a slow
      // configuration load is added to every shutdown.
      closed = true
      await queue
      await running.started?.server.close()
    },
  }
}
