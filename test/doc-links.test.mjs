// Un document cité mais introuvable ne fait rougir personne.
// Voir docs/internal/architecture.md.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const SCANNED = /\.(md|ts|tsx|mjs|yml|yaml|json|vue)$/

// Dans du code, une citation vit dans un commentaire, et les chemins fabriqués
// vivent dans des chaînes : un test, une fixture et le catalogue de mutation en
// écrivent qui n'existent pas, et c'est leur travail. Ne lire que les
// commentaires sépare les deux sans exempter aucun fichier.
const CODE = /\.(ts|tsx|mjs|json|vue)$/
const COMMENT = /^\s*(\/\/|\/\*|\*)/

const URL_LIKE = /https?:\/\/\S+/g

// Le point initial est facultatif, pour `.changeset/README.md` et `.claude/…`,
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
  const lines = readFileSync(join(root, path), 'utf8').replace(URL_LIKE, ' ').split('\n')
  const read = CODE.test(path) ? lines.filter((line) => COMMENT.test(line)) : lines

  return [...new Set(read.join('\n').match(MENTION) ?? [])]
}

const scanned = tracked.filter((path) => SCANNED.test(path))

test('les documents cités existent', () => {
  const missing = []

  for (const path of scanned)
    for (const mention of mentionsOf(path)) {
      // Le chemin d'abord, `README.md` à la racine en étant un, puis le nom de
      // fichier seul. Plusieurs documents peuvent porter le même nom, un skill
      // et un autre skill : la citation reste résoluble, et c'est le second
      // contrôle qui exige un chemin là où un déplacement doit se voir.
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
