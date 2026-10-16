// The points a comparison can start from, besides the last commit and a date:
// the repository's default branch and its tags, a tag being a release.

import { execFileSync } from 'node:child_process'

export interface Versions {
  // `null` when Git cannot tell which branch is the default one.
  branch: string | null
  // The newest first, with the date each was made.
  tags: { name: string; date: string }[]
}

// At most this many tags: a project releasing weekly would otherwise fill a menu.
const TAGS = 20

export function versionsOf(root: string): Versions {
  return { branch: defaultBranch(root), tags: tags(root) }
}

// What the remote names as its default, or else `main`, then `master`, when the
// repository has it: a local repository has no remote to ask.
function defaultBranch(root: string): string | null {
  const remote = read(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])
  if (remote) return remote.replace(/^origin\//, '')
  for (const name of ['main', 'master'])
    if (read(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]) !== null) return name
  return null
}

function tags(root: string): Versions['tags'] {
  const listed = read(root, [
    'for-each-ref',
    '--sort=-creatordate',
    `--count=${TAGS}`,
    '--format=%(refname:short)%09%(creatordate:iso-strict)',
    'refs/tags',
  ])
  if (!listed) return []
  // In ISO form whatever Git prints, `Z` or `+00:00` depending on its version. A
  // tag on a blob or a tree has no date, and is no release to start from.
  return listed.split('\n').flatMap((line) => {
    const [name = '', date = ''] = line.split('\t')
    const at = Date.parse(date)
    return Number.isNaN(at) ? [] : [{ name, date: new Date(at).toISOString() }]
  })
}

// What Git prints, trimmed, or `null` when it fails: none of these is worth a
// reason, the versions view just offers fewer points.
function read(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}
