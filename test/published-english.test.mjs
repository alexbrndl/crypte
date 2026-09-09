// Le code publié est en anglais. Voir docs/internal/architecture.md.

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

const FRENCH = /[àâäçéèêëîïôöùûüÿœæ]/i

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

// Ce que la liste ne peut pas attraper, dit plutôt que masqué : une phrase
// française assez courte pour n'employer aucun de ces mots-outils. Les mots
// exclus pour cause d'homonymie anglaise — `on`, `car`, `son`, `plus`, `la` —
// sont précisément ceux qui restent à une phrase de cette longueur.
//
// Le garde attrape la phrase ordinaire, pas la brève. C'est une amélioration
// mesurable sur l'état d'avant, où il ne voyait que les accents, et non une
// garantie.
test('une phrase française assez brève échappe encore', () => {
  expect(isFrench('// On garde la valeur brute.')).toBe(false)
})

// La moitié qui compte : la liste ne doit pas mordre sur l'anglais du dépôt.
// `on`, `car`, `son`, `plus` et `la` en sont exclus pour cette raison.
test('l’anglais ordinaire du dépôt n’est pas pris pour du français', () => {
  expect(isFrench('// The car is on the road, and its son plus la carte.')).toBe(false)
  expect(isFrench('// Read the file once, then hand the contents to the caller.')).toBe(false)
  expect(isFrench('// A plugin that misbehaves is refused, and the reason is said.')).toBe(false)
  expect(isFrench('// Measured: the frame navigates twice, not three times.')).toBe(false)
  expect(isFrench('// `entries` is optional, so a reader that predates it still works.')).toBe(
    false,
  )

  // Les six collisions mesurées, qui ont fait retirer autant de mots de la liste.
  expect(isFrench("const font = 'system-ui, sans-serif'")).toBe(false)
  expect(isFrench('// Falls back to sans-serif when the token is missing.')).toBe(false)
  expect(isFrench('// est. 200ms per frame, measured on the demo.')).toBe(false)
  expect(isFrench('// DES and aux buffers are out of scope.')).toBe(false)
  expect(isFrench('// Pour the rows into the table, then encore for the footer.')).toBe(false)
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
