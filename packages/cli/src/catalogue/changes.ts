// What changed in the component catalogue since the last commit: the committed
// fingerprint, read from Git, against the one the catalogue served gives now
// (section 4.6). `HEAD` and not the main branch: guessing `main`, `master` or a
// remote is the question of a pull request, which belongs to `visual-tests`.

import { execFileSync } from 'node:child_process'
import type { Fingerprint, FingerprintEntry } from './fingerprint'

export type Change =
  | { kind: 'appeared'; id: string }
  | {
      kind: 'changed'
      id: string
      // Only what moved; a story whose props and status stayed is not listed,
      // whatever else its digest folds.
      props?: { before: string[]; after: string[] }
      status?: { before: string; after: string }
    }
  | { kind: 'disappeared'; id: string }

// The changes, or why there are none to read. A reason is said rather than an
// empty list, which would read as "nothing changed".
export type Changes = { changes: Change[] } | { reason: string }

const FILE = '.crypte/fingerprint.json'

export function changesSince(root: string, now: Fingerprint): Changes {
  const committed = committedFingerprint(root)
  return typeof committed === 'string'
    ? { reason: committed }
    : { changes: changesOf(committed, now) }
}

// In manifest order: what appeared and changed in the order the catalogue
// holds it now, what disappeared in the order the commit held it.
export function changesOf(before: Fingerprint, after: Fingerprint): Change[] {
  const old = new Map(before.entries.map((entry) => [entry.id, entry]))
  const ids = new Set(after.entries.map((entry) => entry.id))
  const changes: Change[] = []

  for (const entry of after.entries) {
    const was = old.get(entry.id)
    if (!was) {
      changes.push({ kind: 'appeared', id: entry.id })
      continue
    }
    const props = same(was.props, entry.props)
      ? undefined
      : { before: was.props, after: entry.props }
    const status =
      was.status === entry.status ? undefined : { before: was.status, after: entry.status }
    if (props || status)
      changes.push({
        kind: 'changed',
        id: entry.id,
        ...(props && { props }),
        ...(status && { status }),
      })
  }

  for (const entry of before.entries) {
    if (!ids.has(entry.id)) changes.push({ kind: 'disappeared', id: entry.id })
  }

  return changes
}

// Sorted on both sides by the producer, so equal lists hold the same order.
const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((one, at) => one === b[at])

// The fingerprint `HEAD` holds, or what keeps it from being read. Relative to
// the project, `./`, since the project may sit anywhere inside its repository.
export function committedFingerprint(root: string): Fingerprint | string {
  let text: string
  try {
    text = execFileSync('git', ['show', `HEAD:./${FILE}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // Le tampon par défaut, 1 Mio, tuait git vers 3 900 stories (268 octets
      // chacune, §4.6), sans rien sur sa sortie d'erreur. Mesuré.
      maxBuffer: Infinity,
      // Git translates its messages, and the reasons below read them.
      env: { ...process.env, LC_ALL: 'C', LANGUAGE: 'C' },
    })
  } catch (error) {
    return gitReason(error)
  }

  let read: unknown
  try {
    read = JSON.parse(text)
  } catch {
    return `the committed ${FILE} is not JSON`
  }
  return fingerprintIn(read) ?? `the committed ${FILE} is not a fingerprint: ${missing(read)}`
}

function gitReason(error: unknown): string {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'Git is not installed'
  const stderr = (error as { stderr?: unknown }).stderr
  const said = typeof stderr === 'string' ? stderr : ''
  if (said.includes('not a git repository')) return 'the project is not in a Git repository'
  if (/invalid object name|unknown revision|bad revision/.test(said))
    return 'the repository has no commit yet'
  if (/not in 'HEAD'|does not exist in 'HEAD'/.test(said)) return `${FILE} has never been committed`
  const first = said.trim().split('\n')[0] || (error as Error).message
  return `Git could not read the committed ${FILE}: ${first}`
}

// A file someone may have edited, truncated or written with another version:
// what it lacks is named rather than thrown on (DCJ-278).
function fingerprintIn(read: unknown): Fingerprint | null {
  if (!isObject(read) || !Array.isArray(read['entries'])) return null
  return read['entries'].every(isEntry) ? (read as unknown as Fingerprint) : null
}

function missing(read: unknown): string {
  if (!isObject(read) || !Array.isArray(read['entries'])) return 'no `entries` list'
  const at = read['entries'].findIndex((one) => !isEntry(one))
  return `entry ${at} lacks a string \`id\`, a string \`status\` or a \`props\` list`
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isEntry = (value: unknown): value is FingerprintEntry =>
  isObject(value) &&
  typeof value['id'] === 'string' &&
  typeof value['status'] === 'string' &&
  Array.isArray(value['props']) &&
  value['props'].every((one) => typeof one === 'string')
