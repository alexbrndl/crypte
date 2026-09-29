// Ce que le dépôt promet sur la publication : ne pas publier, et déclarer
// `sideEffects` sur le seul paquet qui le porte. La justesse de cette
// déclaration est tenue par `packages/core/test/side-effects.test.ts`.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lire = (...parts) => readFileSync(join(root, ...parts), 'utf8')

const VERSION = lire('.github', 'workflows', 'version.yml')

// Les paquets publiés, lus du dépôt plutôt que listés : un plugin qui naît dans
// `plugins/` entre dans chaque garde sans que personne l'y ajoute. Listés à la
// main, un dossier oublié laissait les gardes verts sans rien lire de lui.
const FICHIERS = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')
const PUBLIÉS = FICHIERS.filter((f) => /^[^/]+\/[^/]+\/package\.json$/.test(f))
  .map(dirname)
  .filter((dossier) => !JSON.parse(lire(dossier, 'package.json')).private)

// `git ls-files 'packages/*/src'` ne rendrait rien : le `*` d'un pathspec git ne
// traverse pas le séparateur, d'où le filtre. Chaque dossier doit rendre une
// source : un paquet dont le code vit hors de `src/` échapperait aux gardes.
const sourcesOf = (dossiers) => {
  const sources = FICHIERS.filter(
    (f) => f.includes('/src/') && dossiers.some((dossier) => f.startsWith(`${dossier}/`)),
  )
  for (const dossier of dossiers) {
    expect(
      sources.some((f) => f.startsWith(`${dossier}/`)),
      `aucune source lue sous ${dossier}`,
    ).toBe(true)
  }
  return sources
}

test('reads the published packages from the repository', () => {
  expect(PUBLIÉS).toEqual(
    expect.arrayContaining([
      'packages/core',
      'packages/cli',
      'packages/react',
      'packages/ui',
      'plugins/tokens',
      'plugins/controls',
    ]),
  )
})

// `changesets/action` publie sur npm dès qu'on lui donne `publish`. Sans cette
// entrée elle se limite à tenir la pull request de version à jour.
//
// C'est le seul geste irréversible du dépôt : `CLAUDE.md` dit qu'un nom de paquet
// publié ne se reprend plus après 72 heures. Le câblage qui l'empêche est une
// **absence**, et une absence ne se voit pas en relisant un diff qui ajoute.
test('the version workflow does not publish', () => {
  // Le bloc `with:` de l'action, et lui seul : `publish` apparaît par ailleurs
  // dans les commentaires qui expliquent pourquoi il n'est pas là.
  const bloc = /changesets\/action@[^\n]*\n(\s+)with:\n((?:\1\s+[^\n]*\n)*)/.exec(VERSION)

  expect(bloc, 'aucun bloc `with:` sous changesets/action dans version.yml').not.toBeNull()

  const entrées = [...bloc[2].matchAll(/^\s+([a-zA-Z][\w-]*):/gm)].map((one) => one[1])

  expect(entrées, 'aucune entrée lue, le motif ne mesure plus rien').not.toEqual([])
  expect(entrées).not.toContain('publish')
})

// `sideEffects: false` autorise un bundler à retirer un import dont il ne voit
// pas l'usage. Faux sur un paquet qui fait quelque chose à l'import, il retire du
// code qui comptait, chez l'utilisateur et pas ici.
//
// Le noyau le déclare parce qu'il n'expose que des types, des fonctions pures et
// deux fabriques de canal. Les autres ne le déclarent pas : l'adaptateur touche
// le DOM, le CLI est un binaire, `tokens` et `controls` sont des fabriques de
// plugin, et `ui`
// livre une feuille de style qu'un bundler retirerait.
//
// Ce cas fixe **quel paquet déclare**. Que la déclaration soit méritée, c'est
// `packages/core/test/side-effects.test.ts` qui le vérifie.
test('only core declares sideEffects: false', () => {
  const déclarent = PUBLIÉS.filter(
    (dossier) => JSON.parse(lire(dossier, 'package.json')).sideEffects === false,
  )

  expect(déclarent).toEqual(['packages/core'])
})

// La quatrième contrainte de `CLAUDE.md`, et la seule des quatre que rien ne
// tenait. Son échec est muet ici, où `vite-plus` est installé, et bruyant chez
// l'utilisateur, qui ne l'a pas.
test('no published code imports vite-plus', () => {
  // `apps/shell` est privé, mais `@crypte/cli` embarque son build.
  const sources = sourcesOf([...PUBLIÉS, 'apps/shell'])

  expect(sources.filter((f) => lire(f).includes('vite-plus'))).toEqual([])
})

// `@crypte/ui` est une feuille du graphe : un paquet qui l'importerait ferait
// charger des composants Vue à qui ne voulait que des types, la panne que la
// troisième contrainte de `CLAUDE.md` existe pour empêcher.
//
// Les bibliothèques de `packages/` seulement : un plugin est l'un des
// consommateurs que `CLAUDE.md` prévoit pour `@crypte/ui`.
test('no package, CLI included, depends on @crypte/ui', () => {
  const paquets = PUBLIÉS.filter(
    (dossier) => dossier.startsWith('packages/') && dossier !== 'packages/ui',
  )
  const déclarent = paquets.filter((dossier) => {
    const manifeste = JSON.parse(lire(dossier, 'package.json'))
    return Object.keys({ ...manifeste.dependencies, ...manifeste.peerDependencies }).includes(
      '@crypte/ui',
    )
  })

  const sources = sourcesOf(paquets)

  expect(déclarent).toEqual([])
  expect(sources.filter((f) => lire(f).includes('@crypte/ui'))).toEqual([])
})
