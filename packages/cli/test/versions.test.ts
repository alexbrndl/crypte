import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { versionsOf } from '../src/catalogue/versions'

// Les points de départ que la vue versions propose : la branche par défaut et les
// tags, du plus récent au plus ancien.

const dossiers: string[] = []
afterEach(() => {
  for (const root of dossiers.splice(0)) rmSync(root, { recursive: true, force: true })
})
const dossier = () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-versions-')))
  dossiers.push(root)
  return root
}
const git = (root: string, date: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
    {
      cwd: root,
      stdio: 'ignore',
      env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date },
    },
  )
const commit = (root: string, date: string, name: string) => {
  writeFileSync(join(root, name), name)
  git(root, date, 'add', '-A')
  git(root, date, 'commit', '-qm', name)
}

describe('the versions a comparison can start from', () => {
  test('names the main branch and the tags, the newest first', () => {
    const root = dossier()
    git(root, '2026-01-01T00:00:00Z', 'init', '-q', '-b', 'main')
    commit(root, '2026-01-01T12:00:00Z', 'a')
    git(root, '2026-01-01T12:00:00Z', 'tag', '-a', 'v1.0.0', '-m', 'v1')
    commit(root, '2026-02-01T12:00:00Z', 'b')
    git(root, '2026-02-01T12:00:00Z', 'tag', '-a', 'v1.1.0', '-m', 'v1.1')

    expect(versionsOf(root)).toEqual({
      branch: 'main',
      tags: [
        { name: 'v1.1.0', date: '2026-02-01T12:00:00.000Z' },
        { name: 'v1.0.0', date: '2026-01-01T12:00:00.000Z' },
      ],
    })
  })

  test('falls back on master, and names no branch it cannot tell', () => {
    const master = dossier()
    git(master, '2026-01-01T00:00:00Z', 'init', '-q', '-b', 'master')
    commit(master, '2026-01-01T12:00:00Z', 'a')
    expect(versionsOf(master)).toEqual({ branch: 'master', tags: [] })

    const autre = dossier()
    git(autre, '2026-01-01T00:00:00Z', 'init', '-q', '-b', 'trunk')
    commit(autre, '2026-01-01T12:00:00Z', 'a')
    expect(versionsOf(autre)).toEqual({ branch: null, tags: [] })
  })

  // Un tag léger sur un blob n'a pas de date : ce n'est pas une release.
  test('leaves out a tag that points at no commit', () => {
    const root = dossier()
    git(root, '2026-01-01T00:00:00Z', 'init', '-q', '-b', 'main')
    commit(root, '2026-01-01T12:00:00Z', 'a')
    git(root, '2026-01-01T12:00:00Z', 'tag', 'v1.0.0')
    const blob = execFileSync('git', ['hash-object', '-w', 'a'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
    git(root, '2026-01-01T12:00:00Z', 'tag', 'blob', blob)

    expect(versionsOf(root).tags.map((one) => one.name)).toEqual(['v1.0.0'])
  })

  test('offers nothing outside a repository', () => {
    expect(versionsOf(dossier())).toEqual({ branch: null, tags: [] })
  })
})
