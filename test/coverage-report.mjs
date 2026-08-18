// Publie le résultat des tests et la couverture en un commentaire de pull
// request, mis à jour en place plutôt qu'empilé.
//
// Le rapport de couverture vivait dans les journaux d'un job que personne
// n'ouvre. Voir docs/internal/architecture.md.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { argv, exit } from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Le marqueur qui distingue notre commentaire des autres : c'est lui qui permet
// de le retrouver pour le remplacer.
export const MARKER = '<!-- crypte-coverage -->'

// Les seuils, lus du même fichier que `vite.config.ts`. Recopiés ici, ils
// auraient dérivé : le tableau aurait annoncé un seuil que la porte n'applique
// pas. Voir docs/internal/architecture.md.
const THRESHOLDS = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'coverage-thresholds.json'), 'utf8'),
)

// Le tableau s'explique tout seul : « branches 88 % » ne veut rien dire pour qui
// lit la pull request sans connaître l'outil. Une par ligne, plutôt qu'un
// paragraphe dense.
const LEGEND = [
  '- <sub>**lignes** : lignes exécutées au moins une fois.</sub>',
  '- <sub>**instructions** : instructions exécutées, plus fin que la ligne quand elle en porte plusieurs.</sub>',
  '- <sub>**branches** : chaque côté d’un `if`, d’un `?:`, d’un `&&` ou d’un `??`. La plus exigeante : un `if` dont seul le cas vrai est éprouvé compte 1 sur 2, alors que sa ligne est comptée couverte.</sub>',
  '- <sub>**fonctions** : fonctions appelées au moins une fois.</sub>',
  '- <sub>**total** : les quatre additionnées, pour classer les dossiers entre eux.</sub>',
]

// Ce que le tableau ne mesure pas, dit à côté de lui : une colonne à 100 % qui
// tait une exclusion est un mensonge par omission.
const EXCLUDED =
  '<sub>Hors mesure : trois fichiers de câblage, l’entrée du CLI, le montage du shell et un module de types. Voir docs/internal/architecture.md.</sub>'

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

// Le dossier d'un fichier du résumé : le paquet ou l'application, pas le chemin
// entier. « instructions 97 % » ne dit pas où chercher ; « packages/cli 88 % de
// branches » le dit. Voir docs/internal/architecture.md.
export function folderOf(path) {
  const found = /(packages|apps)\/([^/]+)/.exec(path)

  return found ? `${found[1]}/${found[2]}` : undefined
}

// L'ordre des colonnes, et le seul : le tableau, le total par ligne et la
// légende le suivent tous.
export const METRICS = ['lines', 'statements', 'branches', 'functions']

// Les métriques additionnées par dossier, dans l'ordre où le résumé les donne.
export function byFolder(summary) {
  const folders = new Map()

  for (const [path, metrics] of Object.entries(summary)) {
    const folder = path === 'total' ? undefined : folderOf(path)
    if (!folder) continue

    const held = folders.get(folder) ?? Object.fromEntries(METRICS.map((name) => [name, [0, 0]]))

    for (const name of METRICS) {
      held[name][0] += metrics[name]?.covered ?? 0
      held[name][1] += metrics[name]?.total ?? 0
    }

    folders.set(folder, held)
  }

  return folders
}

// Un pourcentage, ou 100 quand il n'y a rien à couvrir : zéro sur zéro n'est pas
// une lacune.
function part([covered, total]) {
  return total === 0 ? 100 : (covered / total) * 100
}

function cell(pair) {
  return `${part(pair).toFixed(1)} % <sub>${pair[0]}/${pair[1]}</sub>`
}

// Le total d'une ligne : les quatre métriques additionnées. Le tableau totalisait
// par colonne et pas par dossier, donc rien ne disait lequel est le plus faible
// dans l'ensemble.
// Le total du résumé, mis à la forme des paires pour que `rowTotal` s'applique
// aussi à lui.
export function byTotal(total) {
  return Object.fromEntries(METRICS.map((name) => [name, [total[name].covered, total[name].total]]))
}

export function rowTotal(held) {
  return METRICS.reduce(
    ([covered, total], name) => [covered + held[name][0], total + held[name][1]],
    [0, 0],
  )
}

// Les métriques sous leur seuil, nommées. Rend un tableau vide quand tout tient.
export function failing(summary) {
  const total = summary?.total
  if (!total) return ['couverture non mesurée']

  return Object.entries(THRESHOLDS)
    .filter(([name]) => (total[name]?.pct ?? 0) < THRESHOLDS[name])
    .map(
      ([name, seuil]) =>
        `${LABELS[name]} à ${total[name]?.pct ?? 0} %, sous le seuil de ${seuil} %`,
    )
}

// Ce que le commentaire dit des tests. `results` est la sortie du rapporteur
// `json` de vitest ; absente, on ne prétend rien plutôt que d'annoncer zéro.
function tests(results) {
  if (!results) return 'Résultat des tests indisponible.'

  const files = results.testResults?.length ?? 0
  const cases = results.numTotalTests ?? 0
  const failed = results.numFailedTests ?? 0
  const verdict =
    failed === 0
      ? `**${cases} tests passent**`
      : `**${failed} test${failed > 1 ? 's' : ''} ${failed > 1 ? 'échouent' : 'échoue'}** sur ${cases}`
  const compte = `${verdict}, dans ${files} fichier${files > 1 ? 's' : ''}.`

  if (failed === 0) return compte

  // Les noms plutôt qu'un compte seul : « 2 échouent » envoie lire les journaux,
  // ce que ce commentaire existe pour éviter.
  const noms = (results.testResults ?? [])
    .flatMap((file) => file.assertionResults ?? [])
    .filter((cas) => cas.status === 'failed')
    .slice(0, 3)
    .map((cas) => `- \`${cas.fullName ?? cas.title}\``)

  return [compte, '', ...noms].join('\n')
}

// Le corps du commentaire. Séparé de la publication pour être éprouvé sans
// réseau.
export function compose(summary, results, sha) {
  const total = summary?.total

  // Sans couverture, on le dit et on garde le compte des tests. Lever ici
  // laissait le commentaire d'avant en place : un lancement rouge affichait donc
  // les chiffres verts du précédent, ce qui est pire que pas de commentaire.
  const table = total
    ? [
        '| dossier | progression | total | lignes | instructions | branches | fonctions |',
        '| -- | -- | --: | --: | --: | --: | --: |',
        ...[...byFolder(summary)]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([folder, held]) => {
            const somme = rowTotal(held)

            return `| \`${folder}\` | \`${bar(part(somme))}\` | **${part(somme).toFixed(1)} %** | ${METRICS.map((name) => cell(held[name])).join(' | ')} |`
          }),
        `| **total** | \`${bar(part(rowTotal(byTotal(total))))}\` | **${part(rowTotal(byTotal(total))).toFixed(1)} %** | ${METRICS.map((name) => `**${total[name].pct} %**`).join(' | ')} |`,
      ]
    : ['⚠️ Couverture non mesurée : le lancement s’est arrêté avant.']

  const manques = failing(summary)
  const seuils = total
    ? manques.length === 0
      ? `✅ Seuils tenus : lignes ${THRESHOLDS.lines} %, branches ${THRESHOLDS.branches} %, instructions ${THRESHOLDS.statements} %, fonctions ${THRESHOLDS.functions} %.`
      : `❌ ${manques.join(' ; ')}.`
    : undefined

  const lignes = [MARKER, '## Tests et couverture', '', tests(results), '', ...table, '']

  if (total) lignes.push(...LEGEND, '', EXCLUDED, '')
  if (seuils) lignes.push(seuils, '')
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

// Publie le tableau, et retire celui d'avant. Remplacé sur place, il restait à
// sa position d'origine dans la conversation, donc loin du dernier commit sur une
// longue pull request : on le veut en bas, à côté de ce qu'il mesure.
//
// La liste passe par l'API REST et non par `gh pr view --json comments`, qui rend
// un identifiant GraphQL : la mise à jour répondait alors 404, le premier
// commentaire restait en place, et ses chiffres verts survivaient à tout.
export function publish(body, number, run = gh) {
  const repo = run(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  const liste = `repos/${repo}/issues/${number}/comments`
  const lire = () => JSON.parse(run(['api', '--paginate', liste, '--jq', '[.[] | {id, body}]']))

  const anciens = lire().filter((one) => (one.body ?? '').startsWith(MARKER))

  for (const one of anciens) {
    run(['api', `repos/${repo}/issues/comments/${one.id}`, '--method', 'DELETE'])
  }

  run(['api', liste, '--method', 'POST', '-f', `body=${body}`])

  // Vérifié, pas supposé : c'est un 404 silencieux qui a fait vivre un tableau
  // périmé pendant trois lancements. Et un seul, sinon la pull request en
  // porterait un par pousse.
  const posés = lire().filter((one) => (one.body ?? '').startsWith(MARKER))

  if (posés.length !== 1) {
    throw new Error(`${posés.length} commentaires de couverture après publication, attendu 1`)
  }

  if (posés[0].body.trim() !== body.trim()) {
    throw new Error('le commentaire de couverture n’est pas arrivé tel quel')
  }

  return anciens.length === 0 ? 'posté' : 'remplacé'
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
    tests: read('--tests', 'vitest-report.json'),
    sha: read('--sha'),
    badge: read('--badge'),
  }
}

function main(args) {
  const { pr, resume, tests: chemin, sha, badge: cible } = options(args)
  const summary = readJson(resume)

  if (!summary) console.error(`résumé de couverture introuvable : ${resume}`)

  const body = compose(summary, readJson(chemin), sha)

  console.log(body)

  if (pr) console.error(`commentaire ${publish(body, pr)} sur la pull request ${pr}`)

  // Le badge exige un chiffre : pas de couverture, pas de badge.
  if (cible && summary) writeFileSync(cible, `${JSON.stringify(badge(summary), undefined, 2)}\n`)

  // Le verdict en dernier, pour que le commentaire existe même quand il est
  // mauvais. C'est ce qui rend le contrôle `coverage` de la pull request
  // parlant : vitest garde déjà la porte, celui-ci l'affiche.
  const manques = failing(summary)

  if (manques.length > 0) {
    console.error(`couverture insuffisante : ${manques.join(' ; ')}`)
    exit(1)
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) main(argv.slice(2))
