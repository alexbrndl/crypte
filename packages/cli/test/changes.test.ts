import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { changesOf, changesSince, committedFingerprint } from '../src/changes'
import type { Fingerprint, FingerprintEntry } from '../src/fingerprint'

// Ce qui a changé depuis le dernier commit : l'empreinte que `HEAD` porte,
// relue dans Git, contre celle du catalogue servi.

const entrée = (id: string, props: string[], status = 'none', rest = 'r'): FingerprintEntry => ({
  id,
  component: 'src/X.tsx#X',
  status,
  props,
  rest,
})
const empreinte = (...entries: FingerprintEntry[]): Fingerprint => ({ version: 1, entries })

describe('the changes between two fingerprints', () => {
  test('names what appeared, changed and disappeared, in that order', () => {
    const avant = empreinte(
      entrée('a--garde', ['label']),
      entrée('a--props', ['label']),
      entrée('a--statut', [], 'draft'),
      entrée('a--partie', []),
    )
    const après = empreinte(
      entrée('a--neuve', ['tone']),
      entrée('a--garde', ['label']),
      entrée('a--props', ['label', 'tone']),
      entrée('a--statut', [], 'stable'),
    )

    expect(changesOf(avant, après)).toEqual([
      { kind: 'appeared', id: 'a--neuve' },
      { kind: 'changed', id: 'a--props', props: { before: ['label'], after: ['label', 'tone'] } },
      { kind: 'changed', id: 'a--statut', status: { before: 'draft', after: 'stable' } },
      { kind: 'disappeared', id: 'a--partie' },
    ])
  })

  test('names both halves when the props and the status moved together', () => {
    expect(
      changesOf(
        empreinte(entrée('a--x', ['a'], 'draft')),
        empreinte(entrée('a--x', ['b'], 'stable')),
      ),
    ).toEqual([
      {
        kind: 'changed',
        id: 'a--x',
        props: { before: ['a'], after: ['b'] },
        status: { before: 'draft', after: 'stable' },
      },
    ])
  })

  // Le condensé change avec la source ; le mode changements ne compare que les
  // identifiants, les statuts et les noms de props.
  test('does not list a story whose props and status stayed, whatever else moved', () => {
    expect(
      changesOf(
        empreinte(entrée('a--x', ['a'], 'none', 'avant')),
        empreinte(entrée('a--x', ['a'], 'none', 'après')),
      ),
    ).toEqual([])
  })

  test('tells a removed prop from an equal list of another length', () => {
    expect(
      changesOf(empreinte(entrée('a--x', ['a', 'b'])), empreinte(entrée('a--x', ['a']))),
    ).toEqual([{ kind: 'changed', id: 'a--x', props: { before: ['a', 'b'], after: ['a'] } }])
  })
})

// Des dépôts jetables, hors de celui-ci : `tmpdir()` n'est dans aucun dépôt.
describe('the committed fingerprint', () => {
  const dossiers: string[] = []
  const dossier = () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-changes-')))
    dossiers.push(root)
    return root
  }
  const git = (root: string, ...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
      { cwd: root, stdio: 'ignore' },
    )
  const écrit = (root: string, contenu: string) => {
    mkdirSync(join(root, '.crypte'), { recursive: true })
    writeFileSync(join(root, '.crypte', 'fingerprint.json'), contenu)
  }
  const commis = (root: string, contenu: string) => {
    git(root, 'init', '-q')
    écrit(root, contenu)
    git(root, 'add', '-A')
    git(root, 'commit', '-qm', 'empreinte')
  }

  afterEach(() => {
    for (const root of dossiers.splice(0)) rmSync(root, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  test('reads the fingerprint HEAD holds, not the one on disk', () => {
    const root = dossier()
    commis(root, JSON.stringify(empreinte(entrée('a--x', ['label']))))
    écrit(root, JSON.stringify(empreinte(entrée('a--y', []))))

    expect(committedFingerprint(root)).toEqual(empreinte(entrée('a--x', ['label'])))
  })

  // Le projet de démonstration est un sous-dossier de ce dépôt.
  test('reads it from a project in a folder of its repository', () => {
    const root = dossier()
    git(root, 'init', '-q')
    const projet = join(root, 'apps', 'demo')
    mkdirSync(projet, { recursive: true })
    écrit(projet, JSON.stringify(empreinte(entrée('a--x', []))))
    git(root, 'add', '-A')
    git(root, 'commit', '-qm', 'empreinte')

    expect(committedFingerprint(projet)).toEqual(empreinte(entrée('a--x', [])))
  })

  test('says why when the project is not in a repository', () => {
    expect(committedFingerprint(dossier())).toBe('the project is not in a Git repository')
  })

  // Git traduit ses messages : les raisons ci-dessous les lisent en anglais. Sur
  // une machine sans traduction française, git parle anglais et ce cas passe sans
  // rien prouver ; il tient là où la traduction existe, ce qui est mesuré ici.
  test('reads Git in English whatever the language of the system', () => {
    vi.stubEnv('LC_ALL', 'fr_FR.UTF-8')
    vi.stubEnv('LANG', 'fr_FR.UTF-8')

    expect(committedFingerprint(dossier())).toBe('the project is not in a Git repository')
  })

  test('says why when the repository has no commit', () => {
    const root = dossier()
    git(root, 'init', '-q')

    expect(committedFingerprint(root)).toBe('the repository has no commit yet')
  })

  test.each([
    ['written but never committed', true],
    ['neither written nor committed', false],
  ])('says why when the fingerprint is %s', (_, surDisque) => {
    const root = dossier()
    git(root, 'init', '-q')
    writeFileSync(join(root, 'a'), 'a')
    git(root, 'add', '-A')
    git(root, 'commit', '-qm', 'a')
    if (surDisque) écrit(root, '{}')

    expect(committedFingerprint(root)).toBe('.crypte/fingerprint.json has never been committed')
  })

  test('says why when Git is not installed', () => {
    vi.stubEnv('PATH', join(tmpdir(), 'crypte-sans-git'))

    expect(committedFingerprint(dossier())).toBe('Git is not installed')
  })

  // Un fichier commis qu'on a pu éditer ou tronquer : ce qui manque est nommé.
  test.each([
    ['not JSON', '{ "entries": ', 'the committed .crypte/fingerprint.json is not JSON'],
    [
      'with no entries',
      '{ "version": 1 }',
      'the committed .crypte/fingerprint.json is not a fingerprint: no `entries` list',
    ],
    [
      'with an entry lacking its props',
      '{ "entries": [{ "id": "a", "status": "none", "props": [] }, { "id": "b", "status": "none" }] }',
      'the committed .crypte/fingerprint.json is not a fingerprint: entry 1 lacks a string `id`, a string `status` or a `props` list',
    ],
    [
      'with a prop that is not a name',
      '{ "entries": [{ "id": "a", "status": "none", "props": [1] }] }',
      'the committed .crypte/fingerprint.json is not a fingerprint: entry 0 lacks a string `id`, a string `status` or a `props` list',
    ],
    [
      'that is not an object',
      'null',
      'the committed .crypte/fingerprint.json is not a fingerprint: no `entries` list',
    ],
  ])('says why when the committed file is %s', (_, contenu, raison) => {
    const root = dossier()
    commis(root, contenu)

    expect(committedFingerprint(root)).toBe(raison)
  })

  // 9 000 stories, 1,8 Mio mesurés : au-delà du tampon par défaut de
  // `execFileSync`, 1 Mio.
  test('reads a committed fingerprint larger than one megabyte', () => {
    const root = dossier()
    const grande = empreinte(
      ...Array.from({ length: 9000 }, (_, at) =>
        entrée(`composant/${at}--story-${at}`, ['label', 'tone'], 'stable', 'x'.repeat(16)),
      ),
    )
    commis(root, JSON.stringify(grande, null, 2))

    const lue = committedFingerprint(root)
    expect(typeof lue === 'string' ? lue : lue.entries.length).toBe(9000)
  })

  // Ce que Git dit d'un cas qu'aucune raison ne nomme : sa première ligne.
  test('passes on what Git says of a failure no reason names', () => {
    const root = dossier()
    writeFileSync(join(root, '.git'), 'pas un dépôt')

    expect(committedFingerprint(root)).toMatch(
      /^Git could not read the committed \.crypte\/fingerprint\.json: fatal: invalid gitfile format/,
    )
  })

  test('gives the changes, or the reason there are none to read', () => {
    const root = dossier()
    commis(root, JSON.stringify(empreinte(entrée('a--x', []))))

    expect(changesSince(root, empreinte(entrée('a--x', []), entrée('a--y', [])))).toEqual({
      changes: [{ kind: 'appeared', id: 'a--y' }],
    })
    expect(changesSince(dossier(), empreinte())).toEqual({
      reason: 'the project is not in a Git repository',
    })
  })
})
