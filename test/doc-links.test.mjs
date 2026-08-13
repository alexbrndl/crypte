// Un document cité mais introuvable ne fait rougir personne. Voir architecture.md.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const SCANNED = /\.(md|ts|tsx|mjs|yml|yaml|json|vue)$/
// Ce qui fabrique des chemins faux par construction : un fichier de test, une
// fixture, et le catalogue de mutation, dont chaque entrée porte le code muté.
// Leurs vraies dépendances échouent d'elles-mêmes : `spec.test.ts` lit la
// spécification, donc un déplacement le fait rougir sans ce contrôle.
const FABRICATED = /\.test\.[a-z]+$|[/\\]fixture[/\\]|^test\/mutations\.json$/

const URL_LIKE = /https?:\/\/\S+/g

// Le point initial est facultatif, pour `.changeset/note.md` et `.claude/…`,
// mais un caractère de mot doit suivre : « un fichier .md » n'est pas une citation.
const MENTION = /\.?[\w][\w./-]*\.md/g

const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

const documents = new Set(tracked.filter((path) => path.endsWith('.md')))
const byName = new Map()
for (const path of documents) {
  const name = path.split('/').at(-1)
  byName.set(name, (byName.get(name) ?? []).concat(path))
}

function mentionsOf(path) {
  const text = readFileSync(join(root, path), 'utf8').replace(URL_LIKE, ' ')

  return [...new Set(text.match(MENTION) ?? [])]
}

const scanned = tracked.filter((path) => SCANNED.test(path) && !FABRICATED.test(path))

test('les documents cités existent', () => {
  const missing = []

  for (const path of scanned)
    for (const mention of mentionsOf(path)) {
      // Le chemin d'abord, `README.md` à la racine en étant un, puis le nom de
      // fichier seul. Plusieurs documents peuvent le porter, `SKILL.md` par
      // exemple : la citation reste résoluble, et c'est le second contrôle qui
      // exige un chemin là où un déplacement doit se voir.
      const found = existsSync(join(root, mention)) || byName.has(mention)

      if (!found) missing.push(`${path} cite ${mention}`)
    }

  expect(missing).toEqual([])
})

// Hors de `docs/`, un nom nu survit à un déplacement sans que rien ne le dise :
// le contrôle ci-dessus le retrouve par son nom de fichier. Le chemin complet
// est ce qui rend le déplacement visible.
test('hors de docs, un document est cité par son chemin', () => {
  const bare = []

  for (const path of scanned.filter((p) => !p.startsWith('docs/')))
    for (const mention of mentionsOf(path))
      if (!mention.includes('/') && byName.has(mention) && !documents.has(mention))
        bare.push(`${path} cite ${mention} sans son chemin`)

  expect(bare).toEqual([])
})
