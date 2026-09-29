// The two pieces of `crypte dev`'s file watching that must stop cleanly, apart
// so a test can drive them with a fake `watch` and fake timers: through the
// real file system, macOS neighbours cover a dead watcher, and no API exposes
// the 20 ms window a stop has to close.

import { watch as nodeWatch, readFileSync } from 'node:fs'

// Runs `run` once, `ms` after the last call. Once stopped, nothing: a timer
// armed just before the close rebuilt after it.
export function debounced(run: () => void, ms: number): { soon: () => void; stop: () => void } {
  let pending: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  return {
    soon: () => {
      if (stopped) return
      clearTimeout(pending)
      pending = setTimeout(run, ms)
    },
    stop: () => {
      stopped = true
      clearTimeout(pending)
    },
  }
}

export interface Closable {
  close(): void
}

export type Watch = (file: string, listener: (type: string) => void) => Closable

// One watcher per component file, keyed by path so a sync keeps the ones that
// did not move.
//
// `fs.watch` on a file follows the inode: an editor that saves atomically kills
// the watcher, hence the reopen on `rename`. And once stopped, nothing opens
// again, or a late event reopened one watcher per component into a map nobody
// closes.
export function componentWatchers(
  changed: () => void,
  failed: (file: string, error: unknown) => void,
  watch: Watch = nodeWatch,
): { sync: (files: Iterable<string>) => void; stop: () => void; watched: () => string[] } {
  const open = new Map<string, Closable>()
  let stopped = false

  const start = (file: string): void => {
    if (stopped) return

    // A `change` that leaves the content as last read rebuilds nothing: macOS
    // reports one on files nothing wrote to, measured on new files in a working
    // copy and never under `/private/tmp`, and each rebuilt the catalogue.
    // Content, not `mtime`: at one-second resolution, two quick saves of one size
    // look alike. An edit between the catalogue's read and this one is missed,
    // as on Linux.
    let seen = contentOf(file)

    try {
      open.set(
        file,
        watch(file, (type) => {
          if (type === 'rename') reopen(file)
          else {
            const now = contentOf(file)
            if (now !== undefined && now === seen) return
            seen = now
          }
          changed()
        }),
      )
    } catch (error) {
      failed(file, error)
    }
  }

  // Closed and reopened on the same path, from the watcher's own callback,
  // which Node allows.
  const reopen = (file: string): void => {
    open.get(file)?.close()
    open.delete(file)
    start(file)
  }

  return {
    sync: (files) => {
      const wanted = new Set(files)

      for (const [file, one] of open) {
        if (wanted.has(file)) continue
        one.close()
        open.delete(file)
      }

      for (const file of wanted) if (!open.has(file)) start(file)
    },
    stop: () => {
      stopped = true
      for (const one of open.values()) one.close()
      open.clear()
    },
    watched: () => [...open.keys()].sort(),
  }
}

// Unreadable counts as changed: without a content to compare, the rebuild is
// the safe side.
function contentOf(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}
