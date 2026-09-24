// The two pieces of `crypte dev`'s file watching that must stop cleanly, apart
// so a test can drive them with a fake `watch` and fake timers: through the
// real file system, macOS neighbours cover a dead watcher, and no API exposes
// the 20 ms window a stop has to close.

import { watch as nodeWatch } from 'node:fs'

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

    try {
      open.set(
        file,
        watch(file, (type) => {
          if (type === 'rename') reopen(file)
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
