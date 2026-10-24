import type { Fingerprint } from '@crypte/core/protocol'
import { describe, expect, test } from 'vitest'
import { changesOnGitHub, type GitHub } from '../src/versions/github'

// Ce qu'un build compare à un point qu'il n'a pas calculé : l'empreinte que GitHub
// garde à ce point, deux requêtes, et une raison pour chaque refus.

const GITHUB: GitHub = { repository: 'acme/ui', path: 'apps/demo/', commit: 'f'.repeat(40) }
const SHA = 'a'.repeat(40)
const entrée = (id: string, props: string[]) => ({
  id,
  component: 'src/X.tsx#X',
  status: 'none',
  props,
  rest: 'r',
})
const AVANT: Fingerprint = { version: 1, entries: [entrée('a--x', ['label'])] }
const MAINTENANT: Fingerprint = {
  version: 1,
  entries: [entrée('a--x', ['label', 'tone']), entrée('a--y', [])],
}

// Une réponse par adresse, et les adresses demandées dans l'ordre.
function github(réponses: Record<string, Response | Error>) {
  const demandées: string[] = []
  const read = (async (url: string) => {
    demandées.push(url)
    const réponse = réponses[url]
    if (réponse instanceof Error) throw réponse
    return réponse ?? new Response(null, { status: 404 })
  }) as typeof fetch
  return { demandées, read }
}

const json = (value: unknown) => new Response(JSON.stringify(value))
const API = 'https://api.github.com/repos/acme/ui'
const CONTENU = `${API}/contents/apps/demo/.crypte/fingerprint.json?ref=${SHA}`

describe('a point read from GitHub', () => {
  test('compares the fingerprint a commit, a tag or a branch holds', async () => {
    const { demandées, read } = github({
      [`${API}/commits/release%2F1.0`]: json({ sha: SHA }),
      [CONTENU]: json(AVANT),
    })

    expect(await changesOnGitHub(GITHUB, { from: 'release/1.0' }, MAINTENANT, read)).toEqual({
      from: { ref: 'release/1.0', commit: 'aaaaaaa' },
      changes: [
        { kind: 'changed', id: 'a--x', props: { before: ['label'], after: ['label', 'tone'] } },
        { kind: 'appeared', id: 'a--y' },
      ],
      tokens: null,
    })
    expect(demandées).toEqual([`${API}/commits/release%2F1.0`, CONTENU])
  })

  // Le minuit UTC de la date, compté depuis le commit construit, comme le CLI.
  test('starts from the last commit before a date, back from the commit built', async () => {
    const commits = `${API}/commits?sha=${GITHUB.commit}&until=2026-09-16T00:00:00.000Z&per_page=1`
    const { read } = github({ [commits]: json([{ sha: SHA }]), [CONTENU]: json(AVANT) })

    expect(await changesOnGitHub(GITHUB, { before: '2026-09-16' }, MAINTENANT, read)).toMatchObject(
      {
        from: { ref: 'before 2026-09-16', commit: 'aaaaaaa' },
      },
    )
  })
})

describe('what keeps GitHub from answering', () => {
  const commit = `${API}/commits/v9`
  const avec = async (réponses: Record<string, Response | Error>, since: object = { from: 'v9' }) =>
    changesOnGitHub(GITHUB, since, MAINTENANT, github(réponses).read)

  test.for([
    [{}, 'GitHub shows no commit "v9" in acme/ui, or the repository is private'],
    [
      { [commit]: new Response(null, { status: 422 }) },
      'GitHub shows no commit "v9" in acme/ui, or the repository is private',
    ],
    [{ [commit]: new Response(null, { status: 500 }) }, 'GitHub answered 500'],
    [
      {
        [commit]: new Response(null, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
      },
      'GitHub refuses more requests for now, 60 an hour without a token',
    ],
    [
      { [commit]: new TypeError('Failed to fetch') },
      'GitHub could not be reached: Failed to fetch',
    ],
    [{ [commit]: json({ sha: SHA }) }, '.crypte/fingerprint.json was not committed at v9'],
    [
      { [commit]: json({ sha: SHA }), [CONTENU]: new Response(null, { status: 502 }) },
      'GitHub answered 502',
    ],
    [
      { [commit]: json({ sha: SHA }), [CONTENU]: new Response('<<<') },
      'the committed .crypte/fingerprint.json is not JSON',
    ],
    [
      { [commit]: json({ sha: SHA }), [CONTENU]: json({ version: 1 }) },
      'the committed .crypte/fingerprint.json is not a fingerprint: no `entries` list',
    ],
  ] as const)('says %#: %s', async ([réponses, raison]) => {
    expect(await avec(réponses as Record<string, Response | Error>)).toEqual({ reason: raison })
  })

  test('says a date it cannot read, or one before every commit', async () => {
    const commits = `${API}/commits?sha=${GITHUB.commit}&until=2020-01-01T00:00:00.000Z&per_page=1`

    expect(await avec({}, { before: 'hier' })).toEqual({ reason: '"hier" is not a date' })
    expect(await avec({ [commits]: json([]) }, { before: '2020-01-01' })).toEqual({
      reason: 'no commit before 2020-01-01',
    })
    expect(await avec({}, { before: '2020-01-01' })).toEqual({
      reason: 'GitHub shows no commit "fffffff" in acme/ui, or the repository is private',
    })
  })
})
