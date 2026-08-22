// Une pull request dont le diff ne se relit pas tout seul porte une revue.
//
// Le contrôle ne produit aucune revue : il vérifie qu'elle existe, et seulement
// quand le diff en mérite une. Voir docs/internal/architecture.md.

import { execFileSync } from 'node:child_process'
import { argv, env, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

const MARKER = '<!-- crypte-review -->'

// Ce qui fait foi, ou ce qui porte les règles de travail. De la prose se relit
// sans procédure ; ces cinq formes non, malgré leur extension.
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
  /^docs\/internal\/suivi(\.md$|\/)/,
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

  // Le contrôle ne peut pas exiger que la revue soit postérieure au dernier
  // commit : corriger un point non bloquant sans relancer de tour est permis, et
  // le durcir rendrait ces deux règles contradictoires. Il dit l'écart, et laisse
  // juger.
  const head = gh(['api', `repos/${repo}/pulls/${number}`, '--jq', '.head.sha'])
  const when = gh(['api', `repos/${repo}/commits/${head}`, '--jq', '.commit.committer.date'])

  console.log(`Revue la plus récente : ${latest || 'inconnue'}`)
  console.log(`Dernier commit        : ${when}`)

  if (latest && latest < when)
    console.log(
      "::warning::La revue la plus récente précède le dernier commit. Vérifier que rien de bloquant n'a été ajouté depuis.",
    )
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) main(argv.slice(2))
