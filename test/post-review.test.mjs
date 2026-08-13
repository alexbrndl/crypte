import { expect, test } from 'vitest'
import { MARKER, readCount, validate } from './post-review.mjs'

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

test('un verdict vide ou mal formé ne fait pas tomber le contrôle', () => {
  expect(validate(undefined).length).toBeGreaterThan(0)
  expect(
    validate({ event: 'COMMENT', body: `${MARKER}\naucun bloquant`, comments: 'deux' }),
  ).toContain('`comments` doit être un tableau')
})
