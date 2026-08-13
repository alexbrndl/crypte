import { expect, test } from 'vitest'
import { MARKER, publish, readCount, validate } from './post-review.mjs'

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
