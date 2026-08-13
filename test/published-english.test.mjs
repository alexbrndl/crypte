// Le code publié est en anglais. Voir docs/internal/architecture.md.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const PUBLISHED = /^packages\/[^/]+\/src\//
const FRENCH = /[àâäçéèêëîïôöùûüÿœæ]/i

// Un exemple se cite entre accents graves, et il porte souvent ce qu'il décrit :
// « `é` devient `e` » est en anglais malgré ses accents. Sans espace à
// l'intérieur : une phrase entière entre accents graves passerait sinon entière.
const QUOTED = /`[^`\s]*`/g

export function isFrench(line) {
  return FRENCH.test(line.replace(QUOTED, ''))
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
