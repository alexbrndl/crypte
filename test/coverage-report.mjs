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

// La seule des quatre dont le nom ne dit pas ce qu'elle compte.
const LEGEND = [
  '<sub>**branches** est la plus exigeante : chaque côté d’un `if`, d’un `?:`, d’un `&&` ou d’un `??`. Un `if` dont seul le cas vrai est éprouvé compte 1 sur 2, alors que sa ligne est comptée couverte.</sub>',
]

// Ce que la mesure ne couvre pas, dit à côté d'elle : un chiffre à 100 % qui
// tait une exclusion est un mensonge par omission.
const EXCLUDED =
  '<sub>Hors mesure : trois fichiers de câblage, l’entrée du CLI, le montage du shell et un module de types. Voir docs/internal/architecture.md.</sub>'

const LABELS = {
  statements: 'instructions',
  branches: 'branches',
  functions: 'fonctions',
  lines: 'lignes',
}

// L'ordre de la ligne de total, et le seul endroit qui le fixe.
const METRICS = ['lines', 'statements', 'branches', 'functions']

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

// De combien la mesure peut dépasser un seuil avant qu'il faille le monter.
//
// `CLAUDE.md` pose que les seuils sont au plancher mesuré et « montent quand un
// lot les dépasse ». Rien ne l'appliquait : un seuil laissé derrière la mesure
// est un seuil qu'on peut **baisser** sans que rien ne rougisse, ce qui est la
// seule façon de rendre la mesure inutile.
//
// Trois points, et non zéro : la couverture varie d'un lancement à l'autre, et un
// cliquet au dixième rougirait sur du bruit.
//
// **Ce n'est pas trois points de marge.** La marge vaut `SLACK` moins l'écart du
// jour, et les écarts ne sont pas nuls. Mesuré le 9 septembre 2026 :
//
//     métrique     écart   marge   ce qu'il reste à couvrir
//     statements    0,44    2,56    ~37 instructions sur 52
//     branches      1,95    1,05    ~11 branches sur 103
//     functions     2,20    0,80    ~2 fonctions sur 5
//     lines         1,10    1,90    ~23 lignes sur 23
//
// Donc **oui, un lot qui couvre beaucoup fait rougir ce contrôle**, et c'est ce
// qu'on veut : le plancher doit monter avec lui. Ce qui serait fautif est de le
// découvrir sans savoir quoi écrire, d'où le message qui donne le fichier prêt à
// coller. Ce n'est pas une exception à traiter, c'est la moitié montante de la
// règle que `CLAUDE.md` pose.
//
// Une tolérance en unités non couvertes a été écartée : `functions` n'en a que
// cinq, donc l'écart n'y dépasserait jamais onze et le cliquet n'y mordrait
// jamais. Le point porte la taille de la population avec lui.
const SLACK = 3

// Les seuils que la mesure a dépassés de plus de `SLACK`. Le même verdict attrape
// les deux fautes : un plancher qu'on a oublié de monter, et un plancher qu'on
// baisse pour faire passer un lot — baissé, l'écart grandit d'autant.
export function drifted(summary, thresholds = THRESHOLDS, slack = SLACK) {
  const total = summary?.total
  if (!total) return []

  return Object.entries(thresholds)
    .filter(([name, seuil]) => (total[name]?.pct ?? 0) - seuil > slack)
    .map(
      ([name, seuil]) =>
        `${LABELS[name]} à ${total[name]?.pct ?? 0} %, soit ${((total[name]?.pct ?? 0) - seuil).toFixed(2)} points au-dessus du seuil de ${seuil} %`,
    )
}

// Les seuils au plancher mesuré, arrondis vers le bas. Ce que le message rend à
// coller quand le cliquet mord.
export function floors(summary, thresholds = THRESHOLDS) {
  const total = summary?.total ?? {}

  return Object.fromEntries(
    Object.keys(thresholds).map((name) => [name, Math.floor(total[name]?.pct ?? 0)]),
  )
}

// Ce que le commentaire dit des tests. `results` est la sortie du rapporteur
// `json` de vitest ; absente, on ne prétend rien plutôt que d'annoncer zéro.
function tests(results) {
  if (!results) return 'Résultat des tests indisponible.'

  const files = results.testResults?.length ?? 0
  const cases = results.numTotalTests ?? 0
  const failed = results.numFailedTests ?? 0

  // Une suite vide passe toujours : « 0 tests passent » se lirait comme un
  // succès, alors que c'est le signe qu'aucun cas n'a été collecté.
  if (cases === 0) return '⚠️ **Aucun test rapporté.** Une suite vide passe toujours.'

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
  // Complet, ou rien : un `total` amputé d'une métrique faisait lever le
  // rendu du tableau, donc laissait le commentaire d'avant en place, donc
  // affichait des chiffres périmés. Mesuré à l'exploration.
  const total = METRICS.every((name) => typeof summary?.total?.[name]?.pct === 'number')
    ? summary.total
    : undefined

  // Sans couverture, on le dit plutôt que de lever : un lancement rouge
  // laisserait sinon le commentaire d'avant, et ses chiffres verts.
  const chiffres = total
    ? [METRICS.map((name) => `**${LABELS[name]}** ${total[name].pct} %`).join(' · ')]
    : ['⚠️ Couverture non mesurée : le lancement s’est arrêté avant.']

  const manques = failing(summary)
  const seuils = total
    ? manques.length === 0
      ? `✅ Seuils tenus : lignes ${THRESHOLDS.lines} %, branches ${THRESHOLDS.branches} %, instructions ${THRESHOLDS.statements} %, fonctions ${THRESHOLDS.functions} %.`
      : `❌ ${manques.join(' ; ')}.`
    : undefined

  const lignes = [MARKER, '## Tests et couverture', '', tests(results), '', ...chiffres, '']

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
  // mauvais. C'est le seul endroit où les seuils sont évalués : la configuration
  // de vitest ne les porte pas.
  const manques = failing(summary)

  if (manques.length > 0) {
    console.error(`couverture insuffisante : ${manques.join(' ; ')}`)
    exit(1)
  }

  const dérives = drifted(summary)

  if (dérives.length > 0) {
    console.error(
      `seuil à monter dans test/coverage-thresholds.json : ${dérives.join(' ; ')}. ` +
        'Un seuil laissé derrière la mesure est un seuil qu’on peut baisser sans rien faire rougir.',
    )
    // Le fichier prêt à coller, planchers arrondis vers le bas. Sans lui, l'auteur
    // sait qu'il doit monter un seuil et pas jusqu'où, ce qui invite à mettre le
    // chiffre du jour et à recommencer au lot suivant.
    console.error(`à écrire :\n${JSON.stringify(floors(summary), undefined, 2)}`)
    exit(1)
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) main(argv.slice(2))
