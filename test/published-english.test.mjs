// Aucun français dans `packages/*/src` : le source publié part chez l'utilisateur.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const PUBLISHED = /^packages\/[^/]+\/src\//
const ACCENTS = /[àâäçéèêëîïôöùûüÿœæ]/i

// Les accents ne suffisent pas : « le code publie la surface que le lecteur
// attend » est du français et n'en porte aucun. D'où une seconde passe sur des
// mots-outils, qui sont ce qu'une phrase française ne peut pas éviter.
//
// La liste est **volontairement courte et sans ambiguïté** : chaque mot n'est
// d'aucune langue que le dépôt écrit par ailleurs. `on`, `car`, `son`, `plus` et
// `la` en sont exclus pour la raison inverse, ils sont anglais aussi.
// Six mots ont été retirés après mesure, chacun pour une collision réelle :
// `sans` (`sans-serif`, et la limite de mot coupe sur le tiret), `des` (DES),
// `pour` (to pour), `est` (« est. 200 ms »), `aux` (auxiliary) et `encore`, qui
// est anglais. Le garde lit **toutes** les lignes du source publié, pas seulement
// les commentaires, et `core/ui` est l'endroit destiné à porter du style.
const MOTS =
  /\b(les|une|dans|qui|que|sont|avec|mais|donc|cette|ces|leur|leurs|nous|vous|elle|elles|alors|chaque|ainsi|selon|entre|toujours|jamais|quand|comme|celui|celle|ceux|puis|depuis|lorsque|parce|afin)\b/

// Un exemple se cite entre accents graves, et il porte souvent ce qu'il décrit :
// « `é` devient `e` » est en anglais malgré ses accents. Sans espace à
// l'intérieur : une phrase entière entre accents graves passerait sinon entière.
const QUOTED = /`[^`\s]*`/g

export function isFrench(line) {
  const dit = line.replace(QUOTED, '')

  return ACCENTS.test(dit) || MOTS.test(dit.toLowerCase())
}

const sources = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((path) => PUBLISHED.test(path))

test('un exemple cité n’est pas du français, une phrase citée en est', () => {
  expect(isFrench('// `é` becomes `e`, not a dash. The same marks build `й`.')).toBe(false)
  expect(isFrench('// Marks stay, otherwise `が` becomes `か`.')).toBe(false)

  // Le cas qui passait quand l'exception portait sur toute la portée.
  expect(isFrench('// Rappel : `le résolveur retombe sur la résolution normale`.')).toBe(true)
  expect(isFrench("// L'erreur montrée à l'utilisateur.")).toBe(true)
})

// Les accents seuls laissaient passer une phrase française qui n'en porte pas,
// et c'est la moitié la plus facile à écrire sans y penser.
test('du français sans accent est du français', () => {
  expect(isFrench('// Le nom du fichier, pour que le lecteur sache dans quel sens lire.')).toBe(
    true,
  )
  expect(isFrench('// Ce que le plugin contribue, et sans quoi la passe suivante casse.')).toBe(
    true,
  )
  expect(isFrench('// Deux stories qui tombent sur le meme identifiant, alors on refuse.')).toBe(
    true,
  )
})

test('le code publié ne contient pas de français', () => {
  expect(sources.length, 'aucune source publiée trouvée').toBeGreaterThan(5)

  const found = []

  for (const path of sources) {
    const lines = readFileSync(join(root, path), 'utf8').split('\n')

    lines.forEach((line, index) => {
      if (isFrench(line)) found.push(`${path}:${index + 1} ${line.trim()}`)
    })
  }

  expect(found).toEqual([])
})
