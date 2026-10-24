import { compareFingerprints, readFingerprint } from '@crypte/core/protocol'
import type { Changes, Fingerprint } from '@crypte/core/protocol'

// Ce qu'un build compare à un commit ou une date qu'il n'a pas calculés :
// l'empreinte que GitHub garde à ce point, lue depuis le navigateur. Un dépôt
// public seulement, sans jeton : soixante requêtes par heure, deux par
// comparaison. Le jeton d'un dépôt privé attend l'editor (DCJ-343).

// La forme de `packages/cli/src/catalogue/github.ts`, que `project.json` porte.
export interface GitHub {
  repository: string
  path: string
  commit: string
}

const API = 'https://api.github.com'
const FILE = '.crypte/fingerprint.json'

// Les mêmes raisons que le CLI quand Git les donne (`changes.ts`), et ce que
// seul GitHub peut dire : un dépôt privé ou la limite atteinte.
export async function changesOnGitHub(
  github: GitHub,
  since: { from?: string; before?: string },
  now: Fingerprint,
  read: typeof fetch = fetch,
): Promise<Changes> {
  const ask = async (
    path: string,
    raw = false,
  ): Promise<{ answer: Response } | { reason: string } | { status: number }> => {
    let answer: Response
    try {
      answer = await read(`${API}/repos/${github.repository}${path}`, {
        headers: {
          Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        },
      })
    } catch (error) {
      return {
        reason: `GitHub could not be reached: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
    if (answer.ok) return { answer }
    if (
      (answer.status === 403 || answer.status === 429) &&
      answer.headers.get('x-ratelimit-remaining') === '0'
    )
      return { reason: 'GitHub refuses more requests for now, 60 an hour without a token' }
    return { status: answer.status }
  }

  let ref: string
  let sha: string
  if (since.before !== undefined) {
    if (Number.isNaN(Date.parse(since.before))) return { reason: `"${since.before}" is not a date` }
    const until = new Date(Date.parse(since.before)).toISOString()
    const asked = await ask(`/commits?sha=${github.commit}&until=${until}&per_page=1`)
    if ('reason' in asked) return { reason: asked.reason }
    if ('status' in asked)
      return { reason: unknown(github, github.commit.slice(0, 7), asked.status) }
    const found = (await asked.answer.json()) as { sha?: string }[]
    if (!found[0]?.sha) return { reason: `no commit before ${since.before}` }
    ref = `before ${since.before}`
    sha = found[0].sha
  } else {
    ref = since.from ?? 'HEAD'
    const asked = await ask(`/commits/${encodeURIComponent(ref)}`)
    if ('reason' in asked) return { reason: asked.reason }
    if ('status' in asked) return { reason: unknown(github, ref, asked.status) }
    sha = ((await asked.answer.json()) as { sha: string }).sha
  }

  const asked = await ask(`/contents/${github.path}${FILE}?ref=${sha}`, true)
  if ('reason' in asked) return { reason: asked.reason }
  if ('status' in asked)
    return {
      reason:
        asked.status === 404
          ? `${FILE} was not committed at ${ref}`
          : `GitHub answered ${asked.status}`,
    }

  let text: unknown
  try {
    text = JSON.parse(await asked.answer.text())
  } catch {
    return { reason: `the committed ${FILE} is not JSON` }
  }
  const committed = readFingerprint(text)
  if ('lacks' in committed)
    return { reason: `the committed ${FILE} is not a fingerprint: ${committed.lacks}` }
  return compareFingerprints(committed, now, { ref, commit: sha.slice(0, 7) })
}

// GitHub répond 404 pour un commit inconnu comme pour un dépôt privé, et 422
// pour un nom qu'il ne lit pas comme une révision.
const unknown = (github: GitHub, ref: string, status: number) =>
  status === 404 || status === 422
    ? `GitHub shows no commit "${ref}" in ${github.repository}, or the repository is private`
    : `GitHub answered ${status}`
