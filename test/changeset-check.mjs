// Une pull request qui change un paquet publié dépose sa note de version.
//
// Le contrôle ne juge pas le contenu de la note : il vérifie qu'elle existe.
// Voir architecture.md.

import { execFileSync } from 'node:child_process'
import { argv, env, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

// Ce qu'un utilisateur reçoit : le code d'un paquet, et son manifeste. Un
// `package.json` compte en entier, y compris `scripts` : demander une note de
// trop coûte un fichier, en manquer une publie une version fausse.
const PUBLISHED = /^packages\/[^/]+\/(src\/|package\.json$)/

// `README.md` documente le dossier, `config.json` le configure : ni l'un ni
// l'autre n'est une note.
const NOTE = /^\.changeset\/(?!README\.md$)[^/]+\.md$/

// Rend ce qui a été vu, et si la pull request peut passer.
export function decide(files) {
  const published = files.filter((file) => PUBLISHED.test(file.filename)).map((f) => f.filename)
  const notes = files
    .filter((file) => file.status !== 'removed' && NOTE.test(file.filename))
    .map((f) => f.filename)

  return { published, notes, ok: published.length === 0 || notes.length > 0 }
}

function gh(args) {
  return execFileSync('gh', args, { stdio: 'pipe', encoding: 'utf8' }).trim()
}

// `--paginate` avec `--jq` filtre page par page et rend une ligne par page :
// `--slurp` agrège, et le filtre passe en aval.
export function filesOf(number, repo, run = gh) {
  const pages = JSON.parse(
    run(['api', `repos/${repo}/pulls/${number}/files`, '--paginate', '--slurp']),
  )

  return pages.flat().map(({ filename, status }) => ({ filename, status }))
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
