import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { githubOf } from '../src/catalogue/github'

// Le dépôt GitHub où le shell d'un build lit les points qu'il n'a pas calculés.
// Des dépôts jetables, hors de celui-ci : `tmpdir()` n'est dans aucun dépôt.

const dossiers: string[] = []
const git = (root: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
    { cwd: root, stdio: 'ignore' },
  )

function dépôt(remote?: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-github-')))
  dossiers.push(root)
  git(root, 'init', '-q')
  writeFileSync(join(root, 'a.txt'), 'a')
  git(root, 'add', '-A')
  git(root, 'commit', '-qm', 'a')
  if (remote) git(root, 'remote', 'add', 'origin', remote)
  return root
}

afterEach(() => {
  for (const root of dossiers.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('the GitHub repository of a project', () => {
  test.for([
    'https://github.com/acme/ui.git',
    'https://github.com/acme/ui',
    'git@github.com:acme/ui.git',
    'ssh://git@github.com/acme/ui.git',
  ])('reads %s, with the folder and the commit', (remote) => {
    const root = dépôt(remote)
    mkdirSync(join(root, 'apps', 'demo'), { recursive: true })
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()

    expect(githubOf(join(root, 'apps', 'demo'))).toEqual({
      repository: 'acme/ui',
      path: 'apps/demo/',
      commit,
    })
    expect(githubOf(root)?.path).toBe('')
  })

  test.for([
    ['a remote elsewhere', 'https://gitlab.com/acme/ui.git'],
    ['no remote', undefined],
  ] as const)('gives nothing for %s', ([, remote]) => {
    expect(githubOf(dépôt(remote))).toBeNull()
  })

  test('gives nothing outside a repository', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-github-')))
    dossiers.push(root)

    expect(githubOf(root)).toBeNull()
  })
})
