// Ce que le dépôt promet sur la publication : ne pas publier, et déclarer
// `sideEffects` sur le seul paquet qui le porte. Ce que ce fichier **ne** tient
// pas est la justesse de cette déclaration : voir le bloc en bas.
// Voir docs/internal/architecture.md.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lire = (...parts) => readFileSync(join(root, ...parts), 'utf8')

const VERSION = lire('.github', 'workflows', 'version.yml')

// `changesets/action` publie sur npm dès qu'on lui donne `publish`. Sans cette
// entrée elle se limite à tenir la pull request de version à jour.
//
// C'est le seul geste irréversible du dépôt : `CLAUDE.md` dit qu'un nom de paquet
// publié ne se reprend plus après 72 heures. Le câblage qui l'empêche est une
// **absence**, et une absence ne se voit pas en relisant un diff qui ajoute.
test('le workflow de version ne publie pas', () => {
  // Le bloc `with:` de l'action, et lui seul : `publish` apparaît par ailleurs
  // dans les commentaires qui expliquent pourquoi il n'est pas là.
  const bloc = /changesets\/action@[^\n]*\n(\s+)with:\n((?:\1\s+[^\n]*\n)*)/.exec(VERSION)

  expect(bloc, 'aucun bloc `with:` sous changesets/action dans version.yml').not.toBeNull()

  const entrées = [...bloc[2].matchAll(/^\s+([a-zA-Z][\w-]*):/gm)].map((one) => one[1])

  expect(entrées, 'aucune entrée lue, le motif ne mesure plus rien').not.toEqual([])
  expect(entrées).not.toContain('publish')
})

// Sans ce cas, celui du dessus passerait à l'identique le jour où l'action change
// de nom ou de forme : il lirait un bloc vide des deux côtés.
test('le motif lit bien les entrées que le bloc porte', () => {
  const bloc = /changesets\/action@[^\n]*\n(\s+)with:\n((?:\1\s+[^\n]*\n)*)/.exec(VERSION)
  const entrées = [...bloc[2].matchAll(/^\s+([a-zA-Z][\w-]*):/gm)].map((one) => one[1])

  expect(entrées).toContain('version')
})

// `sideEffects: false` autorise un bundler à retirer un import dont il ne voit
// pas l'usage. Faux sur un paquet qui fait quelque chose à l'import, il retire du
// code qui comptait, chez l'utilisateur et pas ici.
//
// Le noyau le déclare parce qu'il n'expose que des types, des fonctions pures et
// deux fabriques de canal. Les trois autres ne le déclarent pas : l'adaptateur
// touche le DOM, le CLI est un binaire, `tokens` est une fabrique de plugin.
//
// Ce cas fixe **quel paquet déclare**, et rien de plus. Que la déclaration soit
// méritée n'est vérifié par rien, et le bloc en bas dit pourquoi.
test('seul le noyau déclare sideEffects', () => {
  const déclarent = ['core', 'cli', 'react', 'tokens'].filter(
    (nom) => JSON.parse(lire('packages', nom, 'package.json')).sideEffects === false,
  )

  expect(déclarent).toEqual(['core'])
})

// **Ce que ce fichier ne garde pas, et pourquoi.** La justesse de
// `sideEffects: false` — qu'aucun fichier du noyau n'agisse vraiment à l'import —
// a été tentée par un critère ligne à ligne. Trois tours de revue ont trouvé
// trois familles de trous à chaque fois : un appel imbriqué dans un littéral
// (`const r = { c: make() }`), une flèche annotée en TypeScript, une liaison que
// le formateur replie, `export default class`, `as const`.
//
// Le critère juste demande un arbre syntaxique, pas une expression régulière.
// `parseSync` d'oxc le ferait, et il n'est **pas joignable depuis `test/`** :
// `vite` est une dépendance de `packages/cli`, pas de la racine. L'ajouter à la
// racine pour un seul garde est la machinerie que `DCJ-276` existe pour réduire.
//
// Donc ce fichier garde **la déclaration**, qui est exacte et tient en un cas, et
// pas la promesse qu'elle porte. Un garde approximatif sur cette promesse serait
// pire que pas de garde : il dirait vert sur les formes qu'il ne voit pas. Suivi
// en `DCJ-297`.
