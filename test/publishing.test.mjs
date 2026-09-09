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

// Ce qu'une ligne de niveau supérieur fait à l'import. Sortie en fonction et
// exportée parce qu'un critère sans cas est un critère faux : il a laissé passer
// deux formes, un appel portant une flèche et une liaison repliée par le
// formateur. Elle a maintenant ses cas, acceptés **et** refusés.
export function agitÀLImport(ligne) {
  // Une ligne indentée appartient à un corps de fonction, qui ne s'exécute pas à
  // l'import. Une ligne vide non plus.
  if (/^\s/.test(ligne) || ligne.trim() === '') return false

  // Une suite de déclaration, ou un commentaire.
  if (/^[})\]`]/.test(ligne) || /^(\/\/|\/\*|\*)/.test(ligne)) return false

  // Ce qui n'exécute rien : un type, un import, une réexportation, une fonction
  // ou une classe déclarée.
  if (/^(import|export type|export interface|type|interface|declare)\b/.test(ligne)) return false
  if (/^(export )?(function|class)\b/.test(ligne)) return false
  if (/^export [{*]/.test(ligne)) return false

  const liaison = /^(export )?(const|let|var)\b[^=]*=(.*)$/.exec(ligne)

  // Ni déclaration ni liaison : un appel, une affectation, un `new`.
  if (!liaison) return true

  const valeur = (liaison[3] ?? '').trim()

  // Une liaison que le formateur a repliée : la valeur est à la ligne suivante,
  // donc celle-ci ne dit rien. Prudence, on la compte comme un effet — le
  // contraire laissait passer `const a =\n  makeRegistry()`.
  if (valeur === '') return true

  // Une flèche **au début** est une fonction, donc inerte. Ailleurs, c'est un
  // argument passé à un appel qui s'exécute : `f(() => 1)` construit à l'import.
  if (/^(async\s+)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(valeur)) return false
  if (/^(async\s+)?function\b/.test(valeur)) return false

  // Un littéral, une expression régulière, une référence nue.
  if (/^[[{'"`\d\-/]/.test(valeur)) return false
  if (/^(true|false|null|undefined)\s*(,|;)?$/.test(valeur)) return false
  if (/^[A-Za-z_$][\w$.]*\s*(,|;)?$/.test(valeur)) return false

  return true
}

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
        if (agitÀLImport(ligne))
          fautifs.push(`packages/core/src/${nom}:${index + 1} ${ligne.trim()}`)
      })
  }

  expect(fautifs).toEqual([])
})

// Le critère lui-même. Sans ces cas, la seule assertion portait sur des sources
// réelles toutes inertes, donc le garde ne pouvait pas échouer sur une erreur du
// critère — et c'est exactement comme ça que deux formes sont passées.
test('le critère accepte ce qui est inerte', () => {
  for (const ligne of [
    "import { join } from 'node:path'",
    "export type Kind = 'a' | 'b'",
    'export interface Manifest {',
    'export function storyId(path, name) {',
    'export class Channel {',
    "export { storyId } from './id'",
    "export * from './story'",
    '}',
    ')',
    '// un commentaire',
    '  const dans = uneFonction()',
    '',
    'const LATIN = /([a-z])[\u0300-\u036f]+/gi',
    "const NAME = 'crypte'",
    'const MAX = 12',
    'const LIST = [1, 2]',
    'const SHAPE = { a: 1 }',
    'export const PROTOCOL_VERSION = 1',
    'const alias = autreNom',
    'const fn = (a) => a + 1',
    'const fn2 = async () => 1',
    'const fn3 = function () {}',
  ]) {
    expect(agitÀLImport(ligne), ligne).toBe(false)
  }
})

// La moitié qui compte, et celle qui manquait.
test('le critère refuse ce qui s’exécute au chargement', () => {
  for (const ligne of [
    'const registry = makeRegistry()',
    'export const stamp = Date.now()',
    'const node = new Map()',
    'export const conf = load({ deep: true })',
    'globalThis.__crypte = {}',
    'console.warn("effet")',
    'setup()',
    'await ready()',
    // La flèche est un argument, pas la valeur : l'appel s'exécute.
    'export const a = makeRegistry(() => 1)',
    'const b = pipe(x, (y) => y + 1)',
    // Repliée par le formateur : la valeur est à la ligne suivante, donc cette
    // ligne ne dit rien et la prudence est de la compter.
    'const c =',
  ]) {
    expect(agitÀLImport(ligne), ligne).toBe(true)
  }
})
