// What changed in the catalogue since a commit: the fingerprint that commit holds,
// read from Git, against the one the catalogue served gives now (section 4.6).
// `HEAD` unless the reader names another point: a branch, a tag or a commit, or
// the last commit before a date.

import { execFileSync } from 'node:child_process'
import type { Fingerprint, FingerprintEntry, FingerprintToken } from './fingerprint'

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

// A token by its family's identifier and its key, with the literal of each theme
// on either side.
export type TokenChange =
  | { kind: 'appeared'; family: string; key: string; after: Record<string, string> }
  | {
      kind: 'changed'
      family: string
      key: string
      before: Record<string, string>
      after: Record<string, string>
    }
  | { kind: 'disappeared'; family: string; key: string; before: Record<string, string> }

// The changes, or why there are none to read. A reason is said rather than an
// empty list, which would read as "nothing changed". `tokens` is `null` when the
// commit predates tokens in the fingerprint: their history starts after it.
export type Changes =
  | {
      from: { ref: string; commit: string }
      changes: Change[]
      tokens: TokenChange[] | null
    }
  | { reason: string }

// Where the comparison starts: a revision Git knows, or the last commit before a
// date. Neither means `HEAD`.
export interface Since {
  ref?: string
  before?: string
}

const FILE = '.crypte/fingerprint.json'

export function changesSince(root: string, now: Fingerprint, since: Since = {}): Changes {
  const commit = commitOf(root, since)
  if (commit.reason !== undefined) return { reason: commit.reason }
  const committed = committedFingerprint(root, commit.sha)
  return typeof committed === 'string'
    ? { reason: committed }
    : {
        from: { ref: commit.ref, commit: commit.sha.slice(0, 7) },
        changes: changesOf(committed, now),
        tokens:
          committed.tokens === undefined
            ? null
            : tokenChangesOf(committed.tokens, now.tokens ?? []),
      }
}

// The commit a point names, resolved once so a moving branch cannot change
// between two reads. A name starting with a dash is refused before Git sees it:
// it would read as an option.
function commitOf(
  root: string,
  since: Since,
): { ref: string; sha: string; reason?: undefined } | { reason: string } {
  if (since.before !== undefined) {
    if (Number.isNaN(Date.parse(since.before))) return { reason: `"${since.before}" is not a date` }
    const sha = git(root, ['rev-list', '-1', `--before=${since.before}`, 'HEAD'])
    if (typeof sha !== 'string') return { reason: sha.reason }
    return sha === ''
      ? { reason: `no commit before ${since.before}` }
      : { ref: `before ${since.before}`, sha }
  }
  const ref = since.ref ?? 'HEAD'
  if (ref === '' || ref.startsWith('-')) return { reason: `"${ref}" is not a revision` }
  const sha = git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
  // `--quiet` makes an unknown revision exit 1 with nothing said; `HEAD` unknown is
  // a repository with no commit.
  if (typeof sha !== 'string')
    return {
      reason:
        sha.code !== 1
          ? sha.reason
          : ref === 'HEAD'
            ? 'the repository has no commit yet'
            : `"${ref}" is not a commit Git knows`,
    }
  return { ref, sha }
}

// What Git prints, trimmed, or the reason it failed and its exit code.
function git(root: string, args: string[]): string | { reason: string; code?: number } {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LC_ALL: 'C', LANGUAGE: 'C' },
    }).trim()
  } catch (error) {
    return { reason: gitReason(error), code: (error as { status?: number }).status }
  }
}

// Each token compared on its family and key, theme by theme.
export function tokenChangesOf(
  before: FingerprintToken[],
  after: FingerprintToken[],
): TokenChange[] {
  const id = (one: FingerprintToken) => `${one.family}\u0000${one.key}`
  const old = new Map(before.map((one) => [id(one), one]))
  const now = new Set(after.map(id))
  const changes: TokenChange[] = []

  for (const one of after) {
    const was = old.get(id(one))
    if (!was)
      changes.push({ kind: 'appeared', family: one.family, key: one.key, after: one.themes })
    else if (JSON.stringify(was.themes) !== JSON.stringify(one.themes))
      changes.push({
        kind: 'changed',
        family: one.family,
        key: one.key,
        before: was.themes,
        after: one.themes,
      })
  }
  for (const one of before) {
    if (!now.has(id(one)))
      changes.push({ kind: 'disappeared', family: one.family, key: one.key, before: one.themes })
  }

  return changes
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

// The fingerprint a commit holds, `HEAD` by default, or what keeps it from being
// read. Relative to the project, `./`, since the project may sit anywhere inside
// its repository.
export function committedFingerprint(root: string, commit = 'HEAD'): Fingerprint | string {
  let text: string
  try {
    text = execFileSync('git', ['show', `${commit}:./${FILE}`], {
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
  if (/not in '[^']+'|does not exist in '[^']+'/.test(said))
    return `${FILE} has never been committed`
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
