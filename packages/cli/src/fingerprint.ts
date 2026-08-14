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

// The fields the fingerprint keeps in the open. Everything not listed goes into
// `rest`, so a field added to `StoryEntry` is folded in rather than forgotten.
const KEPT = new Set(['id', 'component', 'props', 'meta'])

export function fingerprintOf(manifest: Manifest): Fingerprint {
  return {
    version: manifest.version,
    entries: manifest.entries.map((entry) => ({
      id: entry.id,
      component: `${entry.component.file}#${entry.component.export}`,
      // A story with no `meta` still has a status in the fingerprint, otherwise
      // adding `status: 'draft'` would read as a change of nothing.
      status: entry.meta?.status ?? 'none',
      props: [...entry.props].sort(),
      rest: digestOf(entry),
    })),
  }
}

// Sorted keys, so the same entry gives the same digest whatever order the
// producer wrote it in. `JSON.stringify` keeps insertion order otherwise, and
// the fingerprint would change on a reordering that changes nothing.
function digestOf(entry: StoryEntry): string {
  const rest: Record<string, unknown> = {}

  for (const key of Object.keys(entry).sort()) {
    if (!KEPT.has(key)) rest[key] = entry[key as keyof StoryEntry]
  }

  // `meta` is kept for its status only, so the rest of it still has to travel.
  const { status: _status, ...meta } = entry.meta ?? {}
  if (Object.keys(meta).length > 0) rest['meta'] = meta

  return createHash('sha256').update(stable(rest)).digest('hex').slice(0, 16)
}

// A JSON form whose object keys are sorted at every depth.
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
