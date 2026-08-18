import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from 'vitest'
import {
  changedFiles,
  hunksByFile,
  hunksOf,
  inHunk,
  MARKER,
  publish,
  readCount,
  validate,
} from './post-review.mjs'

// Un faux `gh` : rend le compte de revues marquées, qui n'augmente que si la
// publication a eu lieu.
function fakeGh({ counts, refuse = false }) {
  const calls = []
  let seen = 0

  return {
    calls,
    run(args) {
      calls.push(args.join(' '))
      if (args[0] === 'repo') return 'alexbrndl/crypte'
      if (args[0] === 'api') {
        if (refuse) throw Object.assign(new Error('422'), { stderr: 'Unprocessable Entity' })
        return '{}'
      }
      if (args.includes('reviews')) return String(counts[seen++])

      return '18'
    },
  }
}

function verdict(body, comments = []) {
  return { event: 'COMMENT', body: `${MARKER}\n${body}`, comments }
}

function point(level, body = 'quelque chose') {
  return {
    path: 'packages/cli/src/paths.ts',
    line: 1,
    side: 'RIGHT',
    body: `**${level}.** ${body}`,
  }
}

test('un verdict complet est publiable', () => {
  expect(
    validate(verdict('**Verdict : aucun bloquant, 1 point.**', [point('Observation')])),
  ).toEqual([])
  expect(
    validate(
      verdict('**Verdict : 2 bloquants, 3 points.**', [
        point('Bloquant'),
        point('Bloquant'),
        point('Important'),
      ]),
    ),
  ).toEqual([])
})

test('un verdict sans marqueur est refusé', () => {
  const sans = { event: 'COMMENT', body: '## Revue\n\n**Verdict : aucun bloquant.**', comments: [] }

  expect(validate(sans)).toEqual([expect.stringContaining(MARKER)])
})

test('un marqueur qui ne commence pas le corps est refusé', () => {
  const enfoui = { event: 'COMMENT', body: `## Revue\n${MARKER}\naucun bloquant`, comments: [] }

  expect(validate(enfoui)).toEqual([expect.stringContaining(MARKER)])
})

test('un verdict sans compte de bloquants est refusé', () => {
  expect(validate(verdict('## Revue\n\nRien à signaler.'))).toEqual([
    expect.stringContaining('compte de bloquants'),
  ])
})

test('un bloquant annoncé mais non ancré est refusé', () => {
  const orphelin = verdict('**Verdict : 1 bloquant, 1 point.**', [point('Important')])

  expect(validate(orphelin)).toEqual(['le verdict annonce 1 bloquant(s) et en ancre 0'])
})

test('un bloquant ancré sous un verdict qui n’en annonce aucun est refusé', () => {
  const tu = verdict('**Verdict : aucun bloquant, 1 point.**', [point('Bloquant')])

  expect(validate(tu)).toEqual(['le verdict annonce 0 bloquant(s) et en ancre 1'])
})

test('un point sans niveau est refusé', () => {
  const nu = verdict('**Verdict : aucun bloquant, 1 point.**', [
    { path: 'packages/cli/src/paths.ts', line: 1, side: 'RIGHT', body: 'le nom est mal choisi' },
  ])

  expect(validate(nu)).toEqual(["le point 1 n'ouvre pas sur son niveau"])
})

test('un événement que l’API refuse est refusé ici', () => {
  const changes = {
    ...verdict('**Verdict : 1 bloquant.**', [point('Bloquant')]),
    event: 'REQUEST_CHANGES',
  }

  expect(validate(changes)).toEqual(['`event` doit valoir COMMENT'])
})

test('un compte de revues illisible est refusé, jamais pris pour zéro', () => {
  expect(readCount('0')).toBe(0)
  expect(readCount(' 3\n')).toBe(3)

  for (const illisible of ['', 'null', 'NaN', '-1', 'deux'])
    expect(() => readCount(illisible)).toThrow('illisible')
})

test('une publication qui fait monter le compte est un succès', () => {
  const gh = fakeGh({ counts: [0, 1] })

  expect(publish('revue.json', '18', gh.run)).toEqual({ number: '18', before: 0, after: 1 })
  expect(gh.calls).toContain('api repos/alexbrndl/crypte/pulls/18/reviews --input revue.json')
})

test('une publication acceptée mais sans effet est un échec', () => {
  const gh = fakeGh({ counts: [3, 3] })

  expect(() => publish('revue.json', '18', gh.run)).toThrow("n'a rien donné")
})

test('un refus de l’API est un échec', () => {
  const gh = fakeGh({ counts: [0, 1], refuse: true })

  expect(() => publish('revue.json', '18', gh.run)).toThrow('422')
})

test('sans numéro, la pull request est demandée à gh', () => {
  const gh = fakeGh({ counts: [0, 1] })

  expect(publish('revue.json', undefined, gh.run).number).toBe('18')
  expect(gh.calls).toContain('pr view --json number --jq .number')
})

test('une panne de git laisse les ancrages non vérifiés, mais le dit', () => {
  const erreurs = []
  const dire = console.error
  console.error = (message) => erreurs.push(message)

  try {
    expect(changedFiles(() => 'a.md\nb.md\n')).toEqual(['a.md', 'b.md'])
    expect(erreurs).toEqual([])

    expect(
      changedFiles(() => {
        throw new Error('bad revision')
      }),
    ).toBeUndefined()
    expect(erreurs).toEqual([expect.stringContaining('bad revision')])

    // Une liste vide dirait « le diff ne touche rien », donc ferait refuser
    // chaque point ancré, alors que ce qui manque est un `git fetch`.
    erreurs.length = 0
    expect(changedFiles(() => '\n')).toBeUndefined()
    expect(erreurs).toEqual([expect.stringContaining('origin/main')])
  } finally {
    console.error = dire
  }
})

test('un point ancré hors du diff est refusé', () => {
  const ailleurs = verdict('**Verdict : aucun bloquant, 1 point.**', [point('Observation')])

  expect(validate(ailleurs, ['test/post-review.mjs'])).toEqual([
    'le point 1 est ancré sur packages/cli/src/paths.ts, que le diff ne touche pas',
  ])
  expect(validate(ailleurs, ['packages/cli/src/paths.ts'])).toEqual([])
  expect(validate(ailleurs, undefined)).toEqual([])
})

test('un point sans fichier ni ligne est refusé', () => {
  const flottant = verdict('**Verdict : aucun bloquant, 1 point.**', [
    { body: '**Observation.** la documentation manque' },
  ])

  expect(validate(flottant)).toEqual([
    "le point 1 n'est ancré sur aucun fichier",
    "le point 1 n'est ancré sur aucune ligne",
  ])
})

test('un verdict vide ou mal formé ne fait pas tomber le contrôle', () => {
  expect(validate(undefined).length).toBeGreaterThan(0)
  expect(
    validate({ event: 'COMMENT', body: `${MARKER}\naucun bloquant`, comments: 'deux' }),
  ).toContain('`comments` doit être un tableau')
})

// Les portions du diff. L'API refuse l'appel entier en 422 pour un seul point
// posé hors portion, donc le script doit le voir avant elle.
// Voir docs/internal/architecture.md.

const DIFF = [
  'diff --git a/x.ts b/x.ts',
  '--- a/x.ts',
  '+++ b/x.ts',
  '@@ -1,4 +1,6 @@',
  ' inchangé',
  '+ajouté',
  '@@ -40,3 +42,2 @@ contexte de section',
  ' inchangé',
].join('\n')

test('lit les plages de la version droite, pas de la gauche', () => {
  expect(hunksOf(DIFF)).toEqual([
    [1, 6],
    [42, 43],
  ])
})

// `+c` sans `,d` vaut une seule ligne : compté comme zéro, la plage serait vide
// et un point juste se ferait refuser.
test('compte une portion d’une seule ligne', () => {
  expect(hunksOf('@@ -1 +7 @@')).toEqual([[7, 7]])
})

test('rend une liste vide sur un diff sans portion', () => {
  expect(hunksOf('diff --git a/x.ts b/x.ts\n')).toEqual([])
})

test('accepte une ligne dans une portion, refuse celle du dehors', () => {
  const plages = hunksOf(DIFF)

  expect(inHunk(1, plages)).toBe(true)
  expect(inHunk(6, plages)).toBe(true)
  expect(inHunk(7, plages)).toBe(false)
  expect(inHunk(42, plages)).toBe(true)
  expect(inHunk(44, plages)).toBe(false)
})

// Un fichier dont les portions ne se lisent pas laisse passer : mieux vaut
// laisser l'API trancher que refuser un verdict juste.
test('laisse passer quand aucune portion n’est lisible', () => {
  expect(inHunk(999, [])).toBe(true)
})

test('refuse un point posé hors des portions de son fichier', () => {
  const review = {
    event: 'COMMENT',
    body: `${MARKER}\n**Verdict : aucun bloquant.**`,
    comments: [{ path: 'x.ts', line: 99, side: 'RIGHT', body: '**Important.** …' }],
  }
  const hunks = new Map([['x.ts', hunksOf(DIFF)]])

  expect(validate(review, ['x.ts'], hunks).join(' ')).toContain('hors des portions du diff')
  expect(validate(review, ['x.ts'], undefined)).toEqual([])
})

test('lit les portions fichier par fichier, et rend la main quand git échoue', () => {
  const appels = []
  const run = (args) => {
    appels.push(args.join(' '))
    return DIFF
  }

  expect(hunksByFile(['x.ts', 'y.ts'], run).get('y.ts')).toEqual([
    [1, 6],
    [42, 43],
  ])
  expect(appels).toEqual(['diff origin/main...HEAD -- x.ts', 'diff origin/main...HEAD -- y.ts'])

  expect(hunksByFile(undefined, run)).toBeUndefined()
  expect(
    hunksByFile(['x.ts'], () => {
      throw new Error('pas un dépôt')
    }),
  ).toBeUndefined()
})

// Le câblage réel, pas un lanceur injecté : `git diff --name-only
// origin/main...HEAD` ne s'exécutait jamais, donc une erreur d'arguments passait
// au vert. Sur un dépôt jetable, parce que l'exécuter ici rendrait le résultat
// dépendant de la branche courante. Voir docs/internal/architecture.md.
test('exécute pour de vrai la commande git de changedFiles', () => {
  const racine = mkdtempSync(join(tmpdir(), 'crypte-depot-'))
  const git = (...args) => execFileSync('git', args, { cwd: racine, stdio: 'pipe' })

  try {
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 'test@crypte')
    git('config', 'user.name', 'Test')
    writeFileSync(join(racine, 'garde.txt'), 'un\n')
    git('add', '-A')
    git('commit', '-qm', 'départ')
    // Pas de remote : la référence suffit, et elle évite un dépôt nu de plus.
    git('update-ref', 'refs/remotes/origin/main', 'main')
    git('checkout', '-q', '-b', 'travaux')
    writeFileSync(join(racine, 'change.txt'), 'deux\n')
    git('add', '-A')
    git('commit', '-qm', 'un fichier de plus')

    const module = pathToFileURL(join(process.cwd(), 'test', 'post-review.mjs')).href
    const sortie = execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `import { changedFiles } from ${JSON.stringify(module)}
         console.log(JSON.stringify(changedFiles()))`,
      ],
      { cwd: racine, encoding: 'utf8', stdio: 'pipe' },
    )

    expect(JSON.parse(sortie)).toEqual(['change.txt'])
  } finally {
    rmSync(racine, { recursive: true, force: true })
  }
})

// Et le cas dégénéré, celui qui décide du reste : sans `origin/main`, la liste
// est vide, ce que le script traite comme « illisible » plutôt que comme « le
// diff ne touche rien ». Sinon tous les points seraient refusés, et le message
// enverrait corriger le verdict quand c'est le dépôt qu'il faut mettre à jour.
test('rend undefined quand origin/main n’existe pas', () => {
  const racine = mkdtempSync(join(tmpdir(), 'crypte-depot-'))
  const git = (...args) => execFileSync('git', args, { cwd: racine, stdio: 'pipe' })

  try {
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 'test@crypte')
    git('config', 'user.name', 'Test')
    writeFileSync(join(racine, 'garde.txt'), 'un\n')
    git('add', '-A')
    git('commit', '-qm', 'départ')

    const module = pathToFileURL(join(process.cwd(), 'test', 'post-review.mjs')).href
    const sortie = execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `import { changedFiles } from ${JSON.stringify(module)}
         console.log(JSON.stringify(changedFiles() ?? null))`,
      ],
      { cwd: racine, encoding: 'utf8', stdio: 'pipe' },
    )

    expect(JSON.parse(sortie)).toBeNull()
  } finally {
    rmSync(racine, { recursive: true, force: true })
  }
})
