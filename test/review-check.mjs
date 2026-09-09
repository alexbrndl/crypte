// Une pull request dont le diff ne se relit pas tout seul porte une revue.
//
// Le contrôle ne produit aucune revue : il vérifie qu'elle existe, et seulement
// quand le diff en mérite une. Voir docs/internal/architecture.md.

import { execFileSync } from 'node:child_process'
import { argv, env, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

const MARKER = '<!-- crypte-review -->'

// Ce qui fait foi, ou ce qui porte les règles de travail. De la prose se relit
// sans procédure ; ces quatre formes non, malgré leur extension.
//
// Les dossiers sont acceptés à côté des fichiers : le jour où `docs/contracts.md`
// se scinde, l'exemption ne doit pas s'élargir en silence.
//
// `CLAUDE.md` et `.claude/` comptent à n'importe quelle profondeur. Les skills à
// portée de dossier sont une forme supportée, donc `apps/x/.claude/` doit compter
// comme la racine, sinon le mécanisme de revue se modifie sans revue d'un niveau
// plus bas.
const AUTHORITY = [
  /^docs\/(contracts|decisions)(\.md$|\/)/,
  /(^|\/)CLAUDE\.md$/,
  /(^|\/)\.claude\//,
]

// Rend ce qui a été vu, et si le diff se relit tout seul.
export function decide(filenames) {
  // Une liste vide veut dire qu'on n'a rien pu lire, pas que le diff est vide.
  // On exige alors la revue : bloquer est le sens sûr.
  if (filenames.length === 0) return { prose: false, why: 'aucun fichier lu' }

  const authority = filenames.filter((f) => AUTHORITY.some((r) => r.test(f)))
  if (authority.length > 0) return { prose: false, why: 'fait foi', authority }

  const code = filenames.filter((f) => !f.endsWith('.md'))
  if (code.length > 0) return { prose: false, why: 'pas de la prose', code }

  return { prose: true, why: 'prose seule' }
}

// Un corps portant le marqueur, quelle que soit sa place dans la pull request :
// un commentaire simple ne se résout pas, une revue ancrée si, et le contrôle
// accepte les deux pour ne pas dépendre de la forme choisie.
export function marked(bodies) {
  return bodies.filter((body) => (body ?? '').includes(MARKER))
}

function gh(args) {
  return execFileSync('gh', args, { stdio: 'pipe', encoding: 'utf8' }).trim()
}

// `--slurp` rend un tableau de pages, d'où le `flat()`. Un filtre agrégeant passé
// à `--jq` avec `--paginate` s'appliquerait page par page et rendrait un compte
// faux au-delà de trente entrées.
function pages(path, run) {
  return JSON.parse(run(['api', path, '--paginate', '--slurp'])).flat()
}

export function filesOf(number, repo, run = gh) {
  return pages(`repos/${repo}/pulls/${number}/files`, run).map((f) => f.filename)
}

export function reviewsOf(number, repo, run = gh) {
  const comments = pages(`repos/${repo}/issues/${number}/comments`, run)
  const reviews = pages(`repos/${repo}/pulls/${number}/reviews`, run)

  return {
    count: marked(comments.map((c) => c.body)).length + marked(reviews.map((r) => r.body)).length,
    // La plus récente des revues ancrées, pour dire l'écart avec le dernier commit.
    latest: marked(reviews.map((r) => r.body)).length
      ? reviews
          .filter((r) => (r.body ?? '').includes(MARKER))
          .map((r) => r.submitted_at)
          .sort()
          .at(-1)
      : '',
  }
}

// Les fichiers qu'ont touchés les commits postérieurs à `since`. Par `compare`
// plutôt qu'un appel par commit : une pull request de trente commits ferait
// trente requêtes pour la même réponse.
export function changedSince(number, repo, since, run = gh) {
  const commits = pages(`repos/${repo}/pulls/${number}/commits`, run)

  // Le dernier commit à la date de la revue ou avant. Aucun, et tout le diff est
  // postérieur, ce que le premier parent du plus ancien commit exprime.
  const before = commits.filter((one) => one.commit.committer.date <= since).at(-1)
  const base = before ? before.sha : (commits[0]?.parents?.[0]?.sha ?? '')
  const head = commits.at(-1)?.sha ?? ''

  if (!base || !head || base === head) return []

  const compared = JSON.parse(run(['api', `repos/${repo}/compare/${base}...${head}`]))

  return (compared.files ?? []).map((one) => one.filename)
}

// `||` et non `??` : un déclenchement manuel passe une chaîne vide, que `??`
// garderait pour un numéro.
function main([given]) {
  const repo =
    env.GITHUB_REPOSITORY ||
    gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  const number = given || gh(['pr', 'view', '--json', 'number', '--jq', '.number'])

  const files = filesOf(number, repo)
  const { prose, why } = decide(files)

  // Jamais un nom de fichier ni un corps de commentaire : un texte venu du dépôt
  // pourrait porter une commande de workflow, `::error::` ou `::add-mask::`.
  console.log(`Fichiers au diff : ${files.length}`)
  console.log(`Nature du diff : ${why}`)

  if (prose) {
    console.log('Prose seule, aucune revue exigée.')
    return
  }

  const { count, latest } = reviewsOf(number, repo)
  console.log(`Revues trouvées : ${count}`)

  if (count === 0) {
    console.error(
      '::error::Aucune revue trouvée. Lancer /review en local avant de fusionner, puis relancer ce contrôle.',
    )
    exit(1)
  }

  // Une revue plus ancienne que le dernier commit n'est pas fautive en soi :
  // corriger un point non bloquant sans relancer de tour est permis. Ce qui ne
  // l'est pas est d'ajouter du **code exécutable** ensuite, que par définition
  // personne n'a relu. Le contrôle sépare donc les deux au lieu de tout laisser
  // juger : la même classification que pour le diff entier, appliquée à ce qui a
  // bougé depuis.
  const head = gh(['api', `repos/${repo}/pulls/${number}`, '--jq', '.head.sha'])
  const when = gh(['api', `repos/${repo}/commits/${head}`, '--jq', '.commit.committer.date'])

  console.log(`Revue la plus récente : ${latest || 'inconnue'}`)
  console.log(`Dernier commit        : ${when}`)

  if (!latest || latest >= when) return

  const since = changedSince(number, repo, latest)

  // Rien de lisible n'est pas la même chose que rien de changé, et le message
  // qui suit doit dire lequel des deux : `decide([])` rend « aucun fichier lu »
  // et bloque, ce qui est le bon sens, mais pas pour la raison affichée.
  if (since.length === 0) {
    console.error(
      '::error::Impossible de lire ce qui a bougé depuis la dernière revue. Relancer ce contrôle.',
    )
    exit(1)
  }

  const after = decide(since)

  console.log(`Depuis la revue : ${since.length} fichier(s), ${after.why}`)

  if (after.prose) {
    console.log(
      '::warning::La revue précède le dernier commit, mais rien de non-prose n’a bougé depuis.',
    )
    return
  }

  console.error(
    '::error::Du code non relu a été ajouté après la dernière revue. Relancer /review sur ces changements seuls, puis relancer ce contrôle.',
  )
  exit(1)
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) main(argv.slice(2))
