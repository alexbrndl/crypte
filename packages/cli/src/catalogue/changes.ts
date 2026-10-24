// What changed in the catalogue since a commit: the fingerprint that commit holds,
// read from Git, against the one the catalogue served gives now (section 4.6).
// `HEAD` unless the reader names another point: a branch, a tag or a commit, or
// the last commit before a date.

import { execFileSync } from 'node:child_process'
import {
  compareFingerprints,
  readFingerprint,
  type Changes,
  type Fingerprint,
} from '@crypte/core/protocol'

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
    : compareFingerprints(committed, now, { ref: commit.ref, commit: commit.sha.slice(0, 7) })
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
    // In full: a date alone, Git completes with the current time of day, so the
    // commit found moved with the hour of the request.
    const sha = git(root, [
      'rev-list',
      '-1',
      `--before=${new Date(Date.parse(since.before)).toISOString()}`,
      'HEAD',
    ])
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
  const fingerprint = readFingerprint(read)
  return 'lacks' in fingerprint
    ? `the committed ${FILE} is not a fingerprint: ${fingerprint.lacks}`
    : fingerprint
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
