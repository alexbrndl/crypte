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

const sources = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((path) => PUBLISHED.test(path))

test('le code publié ne contient pas de français', () => {
  expect(sources.length, 'aucune source publiée trouvée').toBeGreaterThan(5)

  const found = []

  for (const path of sources) {
    const lines = readFileSync(join(root, path), 'utf8').split('\n')

    lines.forEach((line, index) => {
      if (FRENCH.test(line.replace(QUOTED, ''))) found.push(`${path}:${index + 1} ${line.trim()}`)
    })
  }

  expect(found).toEqual([])
})
