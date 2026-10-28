// Ce que le dépôt promet sur la publication : ne pas publier, et déclarer
// `sideEffects` sur le seul paquet qui le porte. La justesse de cette
// déclaration est tenue par `packages/core/test/side-effects.test.ts`.

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
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
      'packages/vue',
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

// Ce qui publie vraiment, `publish.yml`, ne tourne que si la variable de dépôt
// `NPM_PUBLISH` vaut `true`, et jamais sur 0.0.0 : activer la publication est une
// décision, pas l'effet d'une fusion. Tout workflow qui publierait est lu, pas
// seulement celui-là : un second qui oublierait le verrou passerait sinon.
test('nothing publishes unless NPM_PUBLISH is true, and never 0.0.0', () => {
  const dossier = join(root, '.github', 'workflows')
  // Le mot `publish` en position de commande, hors commentaires : toute forme,
  // `pnpm --filter x publish`, `vp pm publish` ou `npm publish&&` comprises.
  // Une clé `publish:` aussi, et exprès : sous `changesets/action`, elle publie.
  // Une clé du même nom qui ne publierait pas ferait rougir à tort, bruyamment.
  const publie = /(?:^|[\s;&|(])publish(?![\w-])/m
  // Chaque job pris seul, pour que le verrou soit celui du job qui publie.
  const jobs = readdirSync(dossier).flatMap((nom) =>
    readFileSync(join(dossier, nom), 'utf8')
      .replace(/^\s*#.*$/gm, '')
      .split(/^(?= {2}[\w-]+:$)/m)
      .slice(1)
      .map((texte) => [`${nom} ${texte.split(':')[0].trim()}`, texte]),
  )
  const publient = jobs.filter(([, texte]) => publie.test(texte))

  expect(jobs.length).toBeGreaterThan(3)
  expect(publient.map(([nom]) => nom)).toEqual(['publish.yml publish'])
  const [, texte] = publient[0]
  expect(texte).toMatch(/^ {4}if: vars\.NPM_PUBLISH == 'true'$/m)
  expect(texte).toMatch(
    /^ {6}- if: steps\.version\.outputs\.version != '0\.0\.0'\n {8}run: vp exec changeset publish$/m,
  )
  // Ni par un script : `vp run release` passerait sinon sous le motif.
  const scripts = JSON.parse(lire('package.json')).scripts ?? {}
  expect(Object.values(scripts).filter((one) => publie.test(one))).toEqual([])
})

// La garde 0.0.0 lit la version de `@crypte/cli` seule : elle ne dit vrai que si
// chaque paquet publié monte avec lui, dans le groupe `fixed`. Hors du groupe,
// un paquet partait à un autre numéro, ou en 0.0.0, sans tag ni release.
// npm met le README dans l'archive quel que soit `files` : sans lui, la page du
// paquet sur npm est vide, celle de `@crypte/cli` comprise. Audit à froid du
// 28 oct. 2026.
test('every published package carries a README titled by its name', () => {
  const sans = PUBLIÉS.filter((dossier) => {
    if (!FICHIERS.includes(`${dossier}/README.md`)) return true
    const { name } = JSON.parse(lire(dossier, 'package.json'))
    return !lire(dossier, 'README.md').startsWith(`# ${name}\n`)
  })
  expect(sans).toEqual([])
})

test('every published package versions with the CLI', () => {
  const [groupe] = JSON.parse(lire('.changeset', 'config.json')).fixed
  const noms = PUBLIÉS.map((dossier) => JSON.parse(lire(dossier, 'package.json')).name)

  expect(noms.length).toBeGreaterThan(5)
  expect([...groupe].sort()).toEqual([...noms].sort())
})

// La provenance n'est signée que pour un paquet qui nomme son dépôt, et npm
// refuse la publication sans : chaque paquet publié le nomme, avec son dossier.
test('each published package names its repository and its folder', () => {
  expect(PUBLIÉS.length).toBeGreaterThan(5)
  for (const dossier of PUBLIÉS) {
    expect(JSON.parse(lire(dossier, 'package.json')).repository, dossier).toEqual({
      type: 'git',
      url: 'git+https://github.com/alexbrndl/crypte.git',
      directory: dossier,
    })
  }
})

// `sideEffects: false` autorise un bundler à retirer un import dont il ne voit
// pas l'usage. Faux sur un paquet qui fait quelque chose à l'import, il retire du
// code qui comptait, chez l'utilisateur et pas ici.
//
// Le noyau le déclare parce qu'il n'expose que des types, des fonctions pures et
// deux fabriques de canal. Les autres ne le déclarent pas : l'adaptateur touche
// le DOM, le CLI est un binaire, `tokens` et `controls` sont des fabriques de
// plugin, et `ui` livre une feuille de style qu'un bundler retirerait.
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

// `@crypte/ui` est une feuille du graphe : une bibliothèque qui l'importerait
// ferait charger des composants Vue à qui ne voulait que des types, la panne
// que la troisième contrainte de `CLAUDE.md` existe pour empêcher.
//
// Les bibliothèques de `packages/` seulement : un plugin est l'un des
// consommateurs que `CLAUDE.md` prévoit pour `@crypte/ui`.
test('no library, CLI included, depends on @crypte/ui', () => {
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

// Ce que le shell sert par son import map, un plugin le laisse hors de son
// bundle : déclaré en pair, que le pack ne copie pas. En dépendance de
// développement seule, il serait copié dedans, et le panneau tournerait sur une
// seconde copie que rien ne signale.
//
// Et en pair optionnel : le CLI dépend du préréglage, et npm installerait sinon
// Vue dans un projet React, pour un panneau qui ne le lit jamais de `node_modules`.
test('a plugin keeps what the shell serves out of its bundle', () => {
  const plugins = PUBLIÉS.filter((dossier) => dossier.startsWith('plugins/'))
  const sources = sourcesOf(plugins)
  const fautifs = []

  for (const nom of ['vue', '@crypte/ui']) {
    const importent = plugins.filter((dossier) =>
      sources.some((f) => f.startsWith(`${dossier}/`) && lire(f).includes(`from '${nom}'`)),
    )
    expect(importent, `aucun plugin n'importe ${nom}, le garde ne lit plus rien`).not.toEqual([])
    for (const dossier of importent) {
      const manifeste = JSON.parse(lire(dossier, 'package.json'))
      if (
        !manifeste.peerDependencies?.[nom] ||
        manifeste.peerDependenciesMeta?.[nom]?.optional !== true ||
        manifeste.dependencies?.[nom]
      )
        fautifs.push(`${dossier}: ${nom}`)
    }
  }

  expect(fautifs).toEqual([])
})
