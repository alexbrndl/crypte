// Publie le résultat des tests et la couverture en un commentaire de pull
// request, mis à jour en place plutôt qu'empilé.
//
// Le rapport de couverture vivait dans les journaux d'un job que personne
// n'ouvre. Voir docs/internal/architecture.md.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

// Le marqueur qui distingue notre commentaire des autres : c'est lui qui permet
// de le retrouver pour le remplacer.
export const MARKER = '<!-- crypte-coverage -->'

// Les seuils de `vite.config.ts`, recopiés ici pour être affichés à côté du
// chiffre. Ils ne décident de rien : c'est vitest qui échoue sous le seuil.
const THRESHOLDS = { statements: 96, branches: 88, functions: 96, lines: 97 }

const LABELS = {
  statements: 'instructions',
  branches: 'branches',
  functions: 'fonctions',
  lines: 'lignes',
}

// Dix cases, une par dixième. Pleine à 100, et jamais pleine en dessous : une
// barre pleine à 97 % ferait croire qu'il ne reste rien à couvrir.
export function bar(pct) {
  const full = Math.floor(pct / 10)

  return '█'.repeat(full) + '░'.repeat(10 - full)
}

// Le tableau d'une métrique : le chiffre, la barre, le seuil, et le compte brut.
function row(name, metric) {
  const seuil = THRESHOLDS[name]
  const verdict = metric.pct >= seuil ? '✅' : '❌'

  return `| ${LABELS[name]} | \`${bar(metric.pct)}\` | **${metric.pct} %** | ${seuil} % | ${metric.covered}/${metric.total} | ${verdict} |`
}

// Ce que le commentaire dit des tests. `results` est la sortie du rapporteur
// `json` de vitest ; absente, on ne prétend rien plutôt que d'annoncer zéro.
function tests(results) {
  if (!results) return 'Résultat des tests indisponible.'

  const files = results.testResults?.length ?? 0
  const cases = results.numTotalTests ?? 0
  const failed = results.numFailedTests ?? 0
  const verdict =
    failed === 0 ? `**${cases} tests passent**` : `**${failed} tests échouent** sur ${cases}`

  return `${verdict}, dans ${files} fichier${files > 1 ? 's' : ''}.`
}

// Le corps du commentaire. Séparé de la publication pour être éprouvé sans
// réseau.
export function compose(summary, results, sha) {
  const total = summary?.total
  if (!total) throw new Error('résumé de couverture illisible : pas de champ `total`')

  const lignes = [
    MARKER,
    '## Tests et couverture',
    '',
    tests(results),
    '',
    '| | progression | couvert | seuil | compte | |',
    '| -- | -- | --: | --: | --: | -- |',
    ...['statements', 'branches', 'functions', 'lines'].map((name) => row(name, total[name])),
    '',
  ]

  if (sha) lignes.push(`<sub>Mesuré sur \`${sha.slice(0, 7)}\`.</sub>`)

  return lignes.join('\n')
}

// Le badge du README, au format « endpoint » que shields.io sait lire. Les
// lignes plutôt qu'une autre métrique : c'est celle que tout le monde entend par
// « couverture ». Arrondi vers le bas : 98,55 affiché « 99 % » flatterait.
// Voir docs/internal/architecture.md.
export function badge(summary) {
  const pct = summary?.total?.lines?.pct
  if (typeof pct !== 'number')
    throw new Error('résumé de couverture illisible : pas de `lines.pct`')

  // Les paliers sont les seuils du dépôt, pas une échelle scolaire : vert vif
  // au-dessus du seuil de lignes, jaune entre le seuil et dix points sous lui,
  // rouge en dessous. Un badge vert sous le seuil mentirait sur une porte rouge.
  const color =
    pct >= THRESHOLDS.lines ? 'brightgreen' : pct >= THRESHOLDS.lines - 10 ? 'yellow' : 'red'

  return { schemaVersion: 1, label: 'coverage', message: `${Math.floor(pct)}%`, color }
}

function gh(args) {
  return execFileSync('gh', args, { stdio: 'pipe', encoding: 'utf8' }).trim()
}

// L'identifiant du commentaire qui porte le marqueur, sinon `undefined`.
export function existing(comments, marker = MARKER) {
  const found = comments.find((one) => (one.body ?? '').startsWith(marker))

  return found?.id
}

// Publie, ou remplace. Sans le remplacement, une pull request de quinze pousses
// porterait quinze tableaux, et le dernier serait le seul vrai.
export function publish(body, number, run = gh) {
  const comments = JSON.parse(
    run(['pr', 'view', number, '--json', 'comments', '--jq', '.comments']),
  )
  const id = existing(comments)
  const repo = run(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  const route = id
    ? `repos/${repo}/issues/comments/${id}`
    : `repos/${repo}/issues/${number}/comments`

  run(['api', route, '--method', id ? 'PATCH' : 'POST', '-f', `body=${body}`])

  return id ? 'remplacé' : 'posté'
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

// Les arguments, nommés : le corps part toujours sur la sortie standard, ce qui
// suffit au résumé de job ; `--pr` seul déclenche la publication.
export function options(args) {
  const read = (nom, defaut) => {
    const at = args.indexOf(nom)

    return at === -1 ? defaut : args[at + 1]
  }

  return {
    pr: read('--pr'),
    resume: read('--resume', 'coverage/coverage-summary.json'),
    tests: read('--tests', '.vitest-report.json'),
    sha: read('--sha'),
    badge: read('--badge'),
  }
}

function main(args) {
  const { pr, resume, tests: chemin, sha, badge: cible } = options(args)
  const summary = readJson(resume)

  if (!summary) {
    console.error(`résumé de couverture introuvable : ${resume}`)
    exit(1)
  }

  const body = compose(summary, readJson(chemin), sha)

  console.log(body)

  // Deux espaces d'indentation et un saut final : le formateur du dépôt écrirait
  // exactement ça, donc l'arbre reste propre après l'écriture.
  if (cible) writeFileSync(cible, `${JSON.stringify(badge(summary), undefined, 2)}\n`)

  if (pr) console.error(`commentaire ${publish(body, pr)} sur la pull request ${pr}`)
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) main(argv.slice(2))
