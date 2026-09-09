// Ce que le dépôt promet sur la publication. Deux promesses qui ne tenaient à
// rien : celle de ne pas publier, et celle qu'un bundler peut retirer.
// Voir docs/internal/architecture.md.

import { readdirSync, readFileSync } from 'node:fs'
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
test('seul le noyau déclare sideEffects, et il le mérite', () => {
  const déclarent = ['core', 'cli', 'react', 'tokens'].filter(
    (nom) => JSON.parse(lire('packages', nom, 'package.json')).sideEffects === false,
  )

  expect(déclarent).toEqual(['core'])
})

// La promesse elle-même : aucun fichier du noyau ne fait quoi que ce soit à
// l'import. Le dossier est **énuméré**, jamais listé à la main : une liste figée
// laissait cinq des dix fichiers hors du garde, et un `catch` avalait un fichier
// renommé sans que rien ne le dise.
test('aucun fichier du noyau n’agit à l’import', () => {
  const dossier = join(root, 'packages', 'core', 'src')
  const fichiers = readdirSync(dossier, { recursive: true, encoding: 'utf8' }).filter((nom) =>
    nom.endsWith('.ts'),
  )

  // Sans ce compte, une énumération qui rend zéro passerait à l'identique, ce qui
  // est le mode d'échec que tout ce fichier existe pour fermer.
  expect(fichiers.length, 'aucun fichier de noyau énuméré').toBeGreaterThan(5)

  const fautifs = []

  for (const nom of fichiers) {
    readFileSync(join(dossier, nom), 'utf8')
      .split('\n')
      .forEach((ligne, index) => {
        // Au niveau supérieur seulement : une ligne indentée appartient à un
        // corps de fonction, qui ne s'exécute pas à l'import.
        if (/^\s/.test(ligne) || ligne.trim() === '') return

        // Une suite de déclaration ou un commentaire.
        if (/^[})\]`]/.test(ligne) || /^(\/\/|\/\*|\*)/.test(ligne)) return

        // Ce qui n'exécute rien : un type, un import, une réexportation, une
        // fonction ou une classe déclarée.
        if (/^(import|export type|export interface|type|interface|declare)\b/.test(ligne)) return
        if (/^(export )?(function|class)\b/.test(ligne)) return
        if (ligne.startsWith('export {') || ligne.startsWith('export *')) return

        // Une liaison ne compte que par ce qui suit le `=`. `const x = f()` crée
        // un singleton au chargement, et c'est précisément ce qui rend
        // `sideEffects: false` faux. Sont inertes : un littéral, une fonction, une
        // référence nue, et une déclaration qui continue à la ligne.
        const liaison = /^(export )?(const|let|var)\b[^=]*=\s*(.*)$/.exec(ligne)
        if (liaison) {
          const valeur = (liaison[3] ?? '').trim()
          const inerte =
            valeur === '' ||
            /^[[{'"`\d\-/]/.test(valeur) ||
            /^(true|false|null|undefined)\b/.test(valeur) ||
            /=>/.test(valeur) ||
            /^function\b/.test(valeur) ||
            /^[A-Za-z_$][\w$.]*\s*(,|;)?$/.test(valeur)

          if (inerte) return
        } else if (!/^(export )?(const|let|var)\b/.test(ligne)) {
          // Ni déclaration ni liaison : un appel, une affectation, un `new`.
        }

        fautifs.push(`packages/core/src/${nom}:${index + 1} ${ligne.trim()}`)
      })
  }

  expect(fautifs).toEqual([])
})
