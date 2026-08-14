// The committed shape of a catalogue. See docs/decisions.md and section 4 of
// docs/contracts.md.

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Manifest, StoryEntry } from '@crypte/core/protocol'

// Beside the manifest, and committed where the manifest is not.
export const FINGERPRINT = join('.crypte', 'fingerprint.json')

export interface FingerprintEntry {
  id: string
  // `file#export`, one string: the pair is what identifies a component, and
  // splitting it here would let one half move without the other.
  component: string
  status: string
  // Sorted, so reordering a story file changes nothing.
  props: string[]
  // Everything else, folded into one value. What it holds does not matter to a
  // reader; that it changes when the entry changes does.
  rest: string
}

export interface Fingerprint {
  version: number
  entries: FingerprintEntry[]
}

// The fields the fingerprint shows on its own. Everything else goes into `rest`,
// so a field added anywhere is folded in rather than forgotten.
//
// `component` and `meta` are not listed: only a part of each is shown, `file`
// with `export` for one and `status` for the other, so the whole object still
// has to travel. Excluding `component` left `ComponentRef.name` in neither, and
// nothing would have shown a field added beside it.
const SHOWN = new Set(['id', 'props'])

export function fingerprintOf(manifest: Manifest): Fingerprint {
  return {
    version: manifest.version,
    entries: manifest.entries.map((entry) => ({
      id: entry.id,
      component: `${entry.component.file}#${entry.component.export}`,
      // A story with no `meta` still has a status in the fingerprint, otherwise
      // adding `status: 'draft'` would read as a change of nothing.
      status: entry.meta?.status ?? 'none',
      // Sorted here too, not only by the producer: this function takes any
      // manifest, including one read from a file somebody else wrote.
      props: [...entry.props].sort(),
      rest: digestOf(entry),
    })),
  }
}

// Everything the fingerprint does not show, folded into one value. The order the
// producer wrote the fields in does not matter: `stable` sorts, and it is the
// only place that does.
function digestOf(entry: StoryEntry): string {
  const rest: Record<string, unknown> = {}

  for (const key of Object.keys(entry)) {
    if (!SHOWN.has(key)) rest[key] = entry[key as keyof StoryEntry]
  }

  return createHash('sha256').update(stable(rest)).digest('hex').slice(0, 16)
}

// A JSON form whose object keys are sorted at every depth. `JSON.stringify`
// keeps insertion order, so without this the digest changed when the producer
// wrote the same fields in another order.
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, held]) => held !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, held]) => `${JSON.stringify(key)}:${stable(held)}`)

  return `{${entries.join(',')}}`
}

export function writeFingerprint(root: string, fingerprint: Fingerprint): string {
  const file = join(root, FINGERPRINT)

  mkdirSync(join(root, '.crypte'), { recursive: true })
  // Trailing newline and two-space indent: the file is committed, so it is read
  // in diffs, and one entry per line is what makes a change legible.
  writeFileSync(file, `${JSON.stringify(fingerprint, null, 2)}\n`)

  return file
}
