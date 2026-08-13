// Poste un verdict de revue sur la pull request, et vérifie qu'il y est arrivé.
//
// Deux lots, vingt et une relectures, deux revues postées : c'est l'étape qui se
// perd. Voir architecture.md.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

// Le marqueur que cherche `require-review.yml`, et lui seul.
export const MARKER = '<!-- crypte-review -->'

// « 1 bloquant », « aucun bloquant » : le compte dont dépend la sortie du brouillon.
const DECLARED = /(\d+|aucun) bloquants?/i

const LEVEL = /^\*\*(Bloquant|Important|Observation)\.\*\*/
const BLOCKING = /^\*\*Bloquant\.\*\*/

// Rend la liste des raisons de refuser le verdict, vide s'il est publiable.
export function validate(review) {
  const problems = []
  const { body, event, comments } = review ?? {}
  const points = Array.isArray(comments) ? comments : []

  if (comments !== undefined && !Array.isArray(comments))
    problems.push('`comments` doit être un tableau')

  if (typeof body !== 'string' || body.split('\n')[0].trim() !== MARKER)
    problems.push(`le corps doit commencer par « ${MARKER} », seul sur sa première ligne`)

  // `APPROVE` et `REQUEST_CHANGES` sont refusés par l'API sur sa propre pull
  // request : l'appel entier échouerait après coup.
  if (event !== 'COMMENT') problems.push('`event` doit valoir COMMENT')

  points.forEach((point, index) => {
    if (!LEVEL.test(point?.body ?? ''))
      problems.push(`le point ${index + 1} n'ouvre pas sur son niveau`)
  })

  const declared = typeof body === 'string' ? body.match(DECLARED) : null
  if (!declared) {
    problems.push(
      'le verdict doit annoncer son compte de bloquants, « 2 bloquants » ou « aucun bloquant »',
    )
    return problems
  }

  // Un bloquant laissé dans le corps n'est pas résolvable, donc ne bloque rien :
  // l'écart entre le compte annoncé et les points ancrés le dit.
  const counted = /^\d+$/.test(declared[1]) ? Number(declared[1]) : 0
  const anchored = points.filter((point) => BLOCKING.test(point?.body ?? '')).length
  if (counted !== anchored)
    problems.push(`le verdict annonce ${counted} bloquant(s) et en ancre ${anchored}`)

  return problems
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' }).trim()
}

// Le compte rendu par `gh`. Un `NaN` passerait toutes les comparaisons qui
// suivent, donc une publication manquée passerait pour un succès.
export function readCount(output) {
  if (!/^\d+$/.test(String(output).trim()))
    throw new Error(`compte de revues illisible : « ${output} »`)

  return Number(output)
}

function marked(number) {
  const count = gh([
    'pr',
    'view',
    number,
    '--json',
    'reviews',
    '--jq',
    `[.reviews[]|select(.body|contains("${MARKER}"))]|length`,
  ])

  return readCount(count)
}

function main([file, given]) {
  if (!file) {
    console.error('usage : node test/post-review.mjs <verdict.json> [numéro]')
    console.error('        1 = verdict refusé, 2 = publication manquée')
    exit(1)
  }

  let review
  try {
    review = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    console.error(`${file} illisible : ${error.message}`)
    exit(1)
  }

  const problems = validate(review)
  if (problems.length > 0) {
    console.error(`Verdict refusé, ${problems.length} raison(s) :`)
    for (const problem of problems) console.error(`  ${problem}`)
    exit(1)
  }

  // Tout ce qui parle à GitHub sort en 2 : une panne de `gh`, une pull request
  // introuvable et un refus de l'API se traitent pareil, la revue n'est pas
  // arrivée. Sans ce cadre, une exception sortirait en 1, le code du verdict
  // refusé.
  let number = given
  try {
    const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
    number ??= gh(['pr', 'view', '--json', 'number', '--jq', '.number'])
    const before = marked(number)

    gh(['api', `repos/${repo}/pulls/${number}/reviews`, '--input', file])

    // Le compte, pas le code de sortie de `gh` : ce qui compte est la présence
    // sur la pull request, puisque c'est elle que lit le contrôle.
    const after = marked(number)
    if (after <= before)
      throw new Error(`toujours ${after} revue(s) marquée(s), la publication n'a rien donné`)

    console.log(`Revue publiée sur #${number} : ${before} → ${after} revue(s) marquée(s).`)
  } catch (error) {
    console.error(`${error.stdout ?? ''}${error.stderr ?? ''}${error.message}`)
    console.error(`La revue n'est pas sur la pull request ${number ? `#${number}` : 'courante'}.`)
    exit(2)
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) main(argv.slice(2))
