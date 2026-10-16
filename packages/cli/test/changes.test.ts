import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  changesOf,
  changesSince,
  committedFingerprint,
  tokenChangesOf,
} from '../src/catalogue/changes'
import type { Fingerprint, FingerprintEntry } from '../src/catalogue/fingerprint'

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

  // Un git tué ne dit rien sur sa sortie d'erreur : la raison nomme alors l'échec
  // lui-même plutôt que de s'arrêter sur ses deux-points.
  test('names the failure when Git says nothing', () => {
    const faux = dossier()
    writeFileSync(join(faux, 'git'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
    vi.stubEnv('PATH', faux)

    expect(committedFingerprint(dossier())).toMatch(
      /^Git could not read the committed \.crypte\/fingerprint\.json: Command failed: git show/,
    )
  })

  // Une résolution de conflit à la main suffit : la section `tokens` se lit comme
  // les entrées, et ce qui manque se nomme au lieu de lever.
  test.each([
    [null, '`tokens` is not a list'],
    [{}, '`tokens` is not a list'],
    [
      [{ family: 'f', key: 'k', type: 'color' }],
      'token 0 lacks a string `family`, `key` or `type`, or `themes` of strings',
    ],
    [
      [{ family: 'f', key: 'k', type: 'color', themes: { light: 1 } }],
      'token 0 lacks a string `family`, `key` or `type`, or `themes` of strings',
    ],
  ])('names a committed tokens section that does not read: %j', (tokens, manque) => {
    const root = dossier()
    commis(root, JSON.stringify({ ...empreinte(), tokens }))

    expect(committedFingerprint(root)).toBe(
      `the committed .crypte/fingerprint.json is not a fingerprint: ${manque}`,
    )
    expect(changesSince(root, empreinte())).toEqual({
      reason: `the committed .crypte/fingerprint.json is not a fingerprint: ${manque}`,
    })
  })

  test('gives the changes, or the reason there are none to read', () => {
    const root = dossier()
    commis(root, JSON.stringify(empreinte(entrée('a--x', []))))

    // Une empreinte commise avant les tokens : leur historique commence après elle.
    expect(changesSince(root, empreinte(entrée('a--x', []), entrée('a--y', [])))).toEqual({
      from: { ref: 'HEAD', commit: expect.stringMatching(/^[0-9a-f]{7}$/) },
      changes: [{ kind: 'appeared', id: 'a--y' }],
      tokens: null,
    })
    expect(changesSince(dossier(), empreinte())).toEqual({
      reason: 'the project is not in a Git repository',
    })
  })
})

describe('the changes of the tokens', () => {
  const jeton = (key: string, themes: Record<string, string>, family = 'tokens--color') => ({
    family,
    key,
    type: 'color',
    themes,
  })

  test('names what appeared, changed and disappeared, theme by theme', () => {
    expect(
      tokenChangesOf(
        [
          jeton('garde', { light: '#111' }),
          jeton('teinte', { light: '#111', dark: '#eee' }),
          jeton('partie', { light: '#000' }),
        ],
        [
          jeton('neuve', { light: '#fff' }),
          jeton('garde', { light: '#111' }),
          jeton('teinte', { light: '#111', dark: '#ddd' }),
        ],
      ),
    ).toEqual([
      { kind: 'appeared', family: 'tokens--color', key: 'neuve', after: { light: '#fff' } },
      {
        kind: 'changed',
        family: 'tokens--color',
        key: 'teinte',
        before: { light: '#111', dark: '#eee' },
        after: { light: '#111', dark: '#ddd' },
      },
      { kind: 'disappeared', family: 'tokens--color', key: 'partie', before: { light: '#000' } },
    ])
  })

  // Une même clé dans deux familles : deux tokens.
  test('keeps two families apart', () => {
    expect(
      tokenChangesOf(
        [jeton('base', { light: '#111' }, 'a')],
        [jeton('base', { light: '#111' }, 'b')],
      ),
    ).toEqual([
      { kind: 'appeared', family: 'b', key: 'base', after: { light: '#111' } },
      { kind: 'disappeared', family: 'a', key: 'base', before: { light: '#111' } },
    ])
  })
})

// Le point de départ : une révision que Git connaît, ou le dernier commit avant
// une date. Des dépôts jetables, aux dates de commit posées.
describe('the point a comparison starts from', () => {
  const dossiers: string[] = []
  afterEach(() => {
    for (const root of dossiers.splice(0)) rmSync(root, { recursive: true, force: true })
  })
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
  // Trois commits datés : a le 1er janvier, b le 1er février, c le 1er mars.
  const dépôt = () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-since-')))
    dossiers.push(root)
    git(root, '2026-01-01T00:00:00Z', 'init', '-q', '-b', 'main')
    for (const [id, date] of [
      ['a', '2026-01-01T12:00:00Z'],
      ['b', '2026-02-01T12:00:00Z'],
      ['c', '2026-03-01T12:00:00Z'],
    ] as const) {
      mkdirSync(join(root, '.crypte'), { recursive: true })
      writeFileSync(
        join(root, '.crypte', 'fingerprint.json'),
        JSON.stringify({ ...empreinte(entrée(`x--${id}`, [])), tokens: [] }),
      )
      git(root, date, 'add', '-A')
      git(root, date, 'commit', '-qm', id)
      if (id === 'a') git(root, date, 'tag', 'v1.0.0')
    }
    return root
  }
  const maintenant = empreinte(entrée('x--c', []))
  const depuis = (root: string, since: Parameters<typeof changesSince>[2]) => {
    const changes = changesSince(root, maintenant, since)
    return 'reason' in changes ? changes.reason : [changes.from.ref, changes.changes]
  }

  test('starts from HEAD, a tag, a branch or a commit', () => {
    const root = dépôt()

    expect(depuis(root, {})).toEqual(['HEAD', []])
    expect(depuis(root, { ref: 'v1.0.0' })).toEqual([
      'v1.0.0',
      [
        { kind: 'appeared', id: 'x--c' },
        { kind: 'disappeared', id: 'x--a' },
      ],
    ])
    expect(depuis(root, { ref: 'main~1' })).toEqual([
      'main~1',
      [
        { kind: 'appeared', id: 'x--c' },
        { kind: 'disappeared', id: 'x--b' },
      ],
    ])
  })

  // Une date seule, Git la complète à l'heure courante : le commit trouvé
  // changeait avec l'heure de la requête. Minuit UTC, quelle que soit l'heure.
  test('reads a date alone as its midnight, whatever the time of the request', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-since-')))
    dossiers.push(root)
    git(root, '2026-02-14T00:00:00Z', 'init', '-q', '-b', 'main')
    for (const [id, date] of [
      ['veille', '2026-02-14T12:00:00Z'],
      ['jour', '2026-02-15T01:00:00Z'],
    ] as const) {
      mkdirSync(join(root, '.crypte'), { recursive: true })
      writeFileSync(
        join(root, '.crypte', 'fingerprint.json'),
        JSON.stringify({ ...empreinte(entrée(`x--${id}`, [])), tokens: [] }),
      )
      git(root, date, 'add', '-A')
      git(root, date, 'commit', '-qm', id)
    }

    expect(depuis(root, { before: '2026-02-15' })).toEqual([
      'before 2026-02-15',
      [
        { kind: 'appeared', id: 'x--c' },
        { kind: 'disappeared', id: 'x--veille' },
      ],
    ])
  })

  test('starts from the last commit before a date', () => {
    const root = dépôt()

    expect(depuis(root, { before: '2026-02-15' })).toEqual([
      'before 2026-02-15',
      [
        { kind: 'appeared', id: 'x--c' },
        { kind: 'disappeared', id: 'x--b' },
      ],
    ])
    expect(depuis(root, { before: '2025-12-01' })).toBe('no commit before 2025-12-01')
    expect(depuis(root, { before: 'hier soir' })).toBe('"hier soir" is not a date')
  })

  // Un nom qui commence par un tiret serait lu comme une option de Git.
  test('refuses what Git does not know, and a name it would read as an option', () => {
    const root = dépôt()

    expect(depuis(root, { ref: 'v9' })).toBe('"v9" is not a commit Git knows')
    expect(depuis(root, { ref: '--output=/tmp/x' })).toBe('"--output=/tmp/x" is not a revision')
    expect(depuis(root, { ref: '' })).toBe('"" is not a revision')
  })

  test('says a repository has no commit yet, from HEAD as from a date', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-since-')))
    dossiers.push(root)
    git(root, '2026-01-01T00:00:00Z', 'init', '-q')

    expect(depuis(root, {})).toBe('the repository has no commit yet')
    expect(depuis(root, { before: '2026-02-01' })).toBe('the repository has no commit yet')
  })

  test('gives the token changes since a commit that held tokens', () => {
    const root = dépôt()
    const changes = changesSince(root, {
      ...maintenant,
      tokens: [{ family: 'f', key: 'k', type: 'color', themes: { default: '#fff' } }],
    })

    expect('tokens' in changes && changes.tokens).toEqual([
      { kind: 'appeared', family: 'f', key: 'k', after: { default: '#fff' } },
    ])
  })
})
