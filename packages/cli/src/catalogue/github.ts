// The GitHub repository a project sits in, where the shell of a build reads the
// fingerprint of a commit or a date the build did not compute (DCJ-386).

import { execFileSync } from 'node:child_process'

export interface GitHub {
  // `owner/name`.
  repository: string
  // The project's folder in the repository, `''` or ending with `/`.
  path: string
  // The commit built, from which a date counts back.
  commit: string
}

// `null` when the remote is not on GitHub, or Git cannot say: the versions view
// then offers only what the build computed.
export function githubOf(root: string): GitHub | null {
  const remote = read(root, ['remote', 'get-url', 'origin'])
  const found = remote && /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remote)
  const path = read(root, ['rev-parse', '--show-prefix'])
  const commit = read(root, ['rev-parse', 'HEAD'])
  if (!found || path === null || !commit) return null
  return { repository: `${found[1]}/${found[2]}`, path, commit }
}

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
