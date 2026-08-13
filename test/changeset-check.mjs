// Une pull request qui change un paquet publié dépose sa note de version.
//
// Le contrôle ne juge pas le contenu de la note : il vérifie qu'elle existe.
// Voir docs/internal/architecture.md.

import { execFileSync } from 'node:child_process'
import { argv, env, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

// Ce qu'un utilisateur reçoit : le code d'un paquet, son manifeste, et ce qui
// décide du contenu de `dist/`, seul dossier publié. La base des `tsconfig` en
// fait partie : les trois paquets ne font que l'étendre, et elle change leurs
// `.d.ts`. Chacun compte en entier : demander une note de trop coûte un
// fichier, en manquer une publie une version fausse.
const PUBLISHED =
  /^(packages\/[^/]+\/(src\/|(package\.json|tsconfig\.json|vite\.config\.ts)$)|tsconfig\.base\.json$)/

// `README.md` documente le dossier, `config.json` le configure : ni l'un ni
// l'autre n'est une note.
const NOTE = /^\.changeset\/(?!README\.md$)[^/]+\.md$/

// Les commentaires de ligne seulement. Mesuré : ils sont retirés des `.d.ts`
// publiés, alors qu'un bloc `/** */` posé sur un type exporté s'y retrouve, donc
// il change ce que reçoit l'utilisateur.
const COMMENT = /^\s*\/\//

// Un fichier dont le diff ne touche que des commentaires de ligne ne change rien
// pour l'utilisateur. Sans patch, l'API n'en fournissant pas au-delà d'une
// certaine taille, on exige la note : c'est le sens sûr.
export function commentsOnly(patch) {
  if (!patch) return false

  const changed = patch
    .split('\n')
    .filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line))
    .map((line) => line.slice(1))

  return changed.length > 0 && changed.every((line) => line.trim() === '' || COMMENT.test(line))
}

// Rend ce qui a été vu, et si la pull request peut passer.
export function decide(files) {
  const published = files
    .filter((file) => PUBLISHED.test(file.filename) && !commentsOnly(file.patch))
    .map((f) => f.filename)

  // Ajoutée, jamais modifiée : plusieurs notes attendent en permanence dans
  // `.changeset/` sur `main`, et le formateur en touche une de temps en temps.
  // Une note reformatée au passage vaudrait alors pour note de la pull request.
  const notes = files
    .filter((file) => file.status === 'added' && NOTE.test(file.filename))
    .map((f) => f.filename)

  return { published, notes, ok: published.length === 0 || notes.length > 0 }
}

function gh(args) {
  return execFileSync('gh', args, { stdio: 'pipe', encoding: 'utf8' }).trim()
}

// `--slurp` rend un tableau de pages, d'où le `flat()`.
export function filesOf(number, repo, run = gh) {
  const pages = JSON.parse(
    run(['api', `repos/${repo}/pulls/${number}/files`, '--paginate', '--slurp']),
  )

  return pages.flat().map(({ filename, status, patch }) => ({ filename, status, patch }))
}

// `||` et non `??` : un déclenchement manuel passe une chaîne vide, que `??`
// garderait pour un numéro.
function main([given]) {
  const repo =
    env.GITHUB_REPOSITORY ||
    gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  const number = given || gh(['pr', 'view', '--json', 'number', '--jq', '.number'])
  const { published, notes, ok } = decide(filesOf(number, repo))

  console.log(`Fichiers publiés touchés : ${published.length ? published.join(', ') : 'aucun'}`)
  console.log(`Notes de version : ${notes.length ? notes.join(', ') : 'aucune'}`)

  if (ok) return

  console.error(
    '::error::Cette pull request modifie un paquet publié sans note de version. Lancer /changeset en local, puis relancer ce contrôle.',
  )
  exit(1)
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) main(argv.slice(2))
