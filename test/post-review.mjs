// Poste un verdict de revue sur la pull request, et vérifie qu'il y est arrivé.
//
// Deux lots, vingt et une relectures, deux revues postées : c'est l'étape qui se
// perd. Voir docs/internal/architecture.md.

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

// Les plages de lignes qu'un point peut viser dans un fichier, côté droit du
// diff. L'API refuse l'appel **entier** en 422 pour un seul point posé hors
// portion, donc le script doit le voir avant elle.
//
// `@@ -a,b +c,d @@` : seul le second couple compte, et `d` vaut 1 quand il est
// absent. Le calcul a été écrit deux fois à la main avant de vivre ici.
export function hunksOf(diff) {
  return [...diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].map((found) => {
    const start = Number(found[1])

    return [start, start + (found[2] === undefined ? 1 : Number(found[2])) - 1]
  })
}

// Vrai quand la ligne tombe dans une portion. Un fichier sans portion lisible
// rend vrai : mieux vaut laisser l'API trancher que refuser un verdict juste.
export function inHunk(line, hunks) {
  if (hunks.length === 0) return true

  return hunks.some(([from, to]) => line >= from && line <= to)
}

// Les plages de chaque fichier du diff, lues une fois. `undefined` quand git
// n'est pas lisible, comme `changedFiles`.
export function hunksByFile(files, run = git) {
  if (!files) return undefined

  try {
    return new Map(
      files.map((file) => [file, hunksOf(run(['diff', 'origin/main...HEAD', '--', file]))]),
    )
  } catch (error) {
    console.error(`Portions du diff illisibles, lignes non vérifiées : ${error.message}`)

    return undefined
  }
}

// Rend la liste des raisons de refuser le verdict, vide s'il est publiable.
// `changed` est la liste des fichiers du diff, quand on l'a : l'API refuse le
// tout en 422 pour un seul point ancré ailleurs. `hunks` fait le même travail
// pour la ligne.
export function validate(review, changed, hunks) {
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
    const où = `le point ${index + 1}`

    if (!LEVEL.test(point?.body ?? '')) problems.push(`${où} n'ouvre pas sur son niveau`)
    if (!point?.path) problems.push(`${où} n'est ancré sur aucun fichier`)
    else if (changed && !changed.includes(point.path))
      problems.push(`${où} est ancré sur ${point.path}, que le diff ne touche pas`)
    if (!Number.isInteger(point?.line) || point.line < 1)
      problems.push(`${où} n'est ancré sur aucune ligne`)
    // Le côté droit seulement : ces plages sont celles de la version d'après,
    // donc un point du côté gauche vise une ligne qu'elles ne décrivent pas, et
    // un fichier supprimé rend une plage vide qui le refuserait toujours.
    else if (
      (point.side ?? 'RIGHT') === 'RIGHT' &&
      hunks?.has(point?.path) &&
      !inHunk(point.line, hunks.get(point.path))
    )
      problems.push(`${où} vise la ligne ${point.line} de ${point.path}, hors des portions du diff`)
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

// `stdio: 'pipe'` : sans lui, la stderr de `gh` part au terminal **et** dans
// `error.stderr`, donc un échec s'affiche deux fois.
function gh(args) {
  return execFileSync('gh', args, { stdio: 'pipe', encoding: 'utf8' }).trim()
}

function git(args) {
  return execFileSync('git', args, { stdio: 'pipe', encoding: 'utf8' })
}

// Le compte rendu par `gh`. Un `NaN` passerait toutes les comparaisons qui
// suivent, donc une publication manquée passerait pour un succès.
export function readCount(output) {
  if (!/^\d+$/.test(String(output).trim()))
    throw new Error(`compte de revues illisible : « ${output} »`)

  return Number(output)
}

function marked(number, run) {
  const count = run([
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

// Les fichiers du diff : un point ancré ailleurs fait refuser le tout en 422,
// donc au code 2, dont le geste n'est pas celui qui corrige. Une panne de git se
// dit : un contrôle éteint en silence est pire que pas de contrôle.
export function changedFiles(run = git) {
  try {
    // Une liste vide vaut « illisible », jamais « le diff ne touche rien » :
    // sinon un `origin/main` non récupéré ferait refuser tous les points, en
    // envoyant corriger le verdict quand c'est le dépôt qu'il faut mettre à jour.
    const files = run(['diff', '--name-only', 'origin/main...HEAD']).split('\n').filter(Boolean)
    if (files.length === 0) throw new Error('aucun fichier, `origin/main` est-il à jour ?')

    return files
  } catch (error) {
    console.error(`Fichiers du diff illisibles, ancrages non vérifiés : ${error.message}`)

    return undefined
  }
}

// Publie, puis vérifie que le compte a bougé. Lève si la revue n'est pas
// arrivée. `run` est injectable pour que ce contrôle soit lui-même éprouvé :
// c'est la garantie que ce script existe pour tenir.
export function publish(file, given, run = gh) {
  const repo = run(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  const number = given ?? run(['pr', 'view', '--json', 'number', '--jq', '.number'])
  const before = marked(number, run)

  run(['api', `repos/${repo}/pulls/${number}/reviews`, '--input', file])

  // Le compte, pas le code de sortie de `gh` : ce qui compte est la présence sur
  // la pull request, puisque c'est elle que lit le contrôle.
  const after = marked(number, run)
  if (after <= before)
    throw new Error(
      `toujours ${after} revue(s) marquée(s) sur #${number}, la publication n'a rien donné`,
    )

  return { number, before, after }
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

  const changed = changedFiles()
  const problems = validate(review, changed, hunksByFile(changed))
  if (problems.length > 0) {
    console.error(`Verdict refusé, ${problems.length} raison(s) :`)
    for (const problem of problems) console.error(`  ${problem}`)
    exit(1)
  }

  // Tout ce qui parle à GitHub sort en 2 : une panne de `gh`, une pull request
  // introuvable et un refus de l'API se traitent pareil, la revue n'est pas
  // arrivée. Sans ce cadre, une exception sortirait en 1, le code du verdict
  // refusé.
  try {
    const { number, before, after } = publish(file, given)
    console.log(`Revue publiée sur #${number} : ${before} → ${after} revue(s) marquée(s).`)
  } catch (error) {
    console.error(`${error.stdout ?? ''}${error.stderr ?? ''}${error.message}`)
    console.error(`La revue n'est pas sur la pull request ${given ? `#${given}` : 'courante'}.`)
    exit(2)
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) main(argv.slice(2))
