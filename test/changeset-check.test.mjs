import { expect, test } from 'vitest'
import { decide, filesOf } from './changeset-check.mjs'

function touche(...noms) {
  return noms.map((filename) => ({ filename, status: 'modified' }))
}

function ajoute(...noms) {
  return noms.map((filename) => ({ filename, status: 'added' }))
}

test('du code publié sans note ne passe pas', () => {
  expect(decide(touche('packages/core/src/protocol/story.ts')).ok).toBe(false)
  expect(decide(touche('packages/cli/package.json')).ok).toBe(false)
})

// Ces deux fichiers décident du contenu de `dist/`, seul dossier publié :
// retirer une entrée de `build.lib.entry` change ce que reçoit l'utilisateur.
test('ce qui décide du contenu de dist exige une note', () => {
  expect(decide(touche('packages/core/vite.config.ts')).ok).toBe(false)
  expect(decide(touche('packages/react/tsconfig.json')).ok).toBe(false)

  // Les trois paquets ne font que l'étendre : c'est là que `target` et
  // `verbatimModuleSyntax` sont écrits, donc là que les `.d.ts` se décident.
  expect(decide(touche('tsconfig.base.json')).ok).toBe(false)
})

test('du code publié avec une note passe', () => {
  const avec = [
    ...touche('packages/core/src/protocol/story.ts'),
    ...ajoute('.changeset/tidy-moons-shake.md'),
  ]

  expect(decide(avec)).toEqual({
    published: ['packages/core/src/protocol/story.ts'],
    notes: ['.changeset/tidy-moons-shake.md'],
    ok: true,
  })
})

test('ce qui n’est pas publié ne demande aucune note', () => {
  const ailleurs = touche(
    'docs/internal/architecture.md',
    '.github/workflows/ci.yml',
    'test/post-review.mjs',
    'apps/shell/src/App.vue',
    'apps/shell/vite.config.ts',
    'packages/core/test/protocol/story.test.ts',
    'packages/cli/test/fixture/jsconfig.json',
    'tsconfig.json',
    'CLAUDE.md',
  )

  expect(decide(ailleurs)).toEqual({ published: [], notes: [], ok: true })
})

test('les fichiers du dossier .changeset ne sont pas tous des notes', () => {
  const faux = [
    ...touche('packages/core/src/index.ts'),
    ...ajoute('.changeset/README.md', '.changeset/config.json', '.changeset/sous/dossier.md'),
  ]

  expect(decide(faux).notes).toEqual([])
  expect(decide(faux).ok).toBe(false)
})

// Toutes les autres valeurs de `status` que l'API rend sur un fichier de
// `.changeset/` : plusieurs notes attendent en permanence dans le dossier, et
// aucune de celles-là n'a été déposée par la pull request.
test('seule une note ajoutée compte', () => {
  const publie = touche('packages/react/src/index.ts')

  for (const status of ['removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged']) {
    const note = { filename: '.changeset/lot-2-protocole.md', status }

    expect(decide([...publie, note])).toEqual({
      published: ['packages/react/src/index.ts'],
      notes: [],
      ok: false,
    })
  }

  expect(decide([...publie, ...ajoute('.changeset/lot-2-protocole.md')]).ok).toBe(true)
})

test('sans aucun fichier, rien n’est exigé', () => {
  expect(decide([])).toEqual({ published: [], notes: [], ok: true })
})

test('les pages de l’API sont aplaties, jamais concaténées', () => {
  const pages = [
    [{ filename: 'packages/core/src/a.ts', status: 'modified', patch: '@@' }],
    [{ filename: '.changeset/note.md', status: 'added', patch: '@@' }],
  ]

  expect(filesOf('18', 'alexbrndl/crypte', () => JSON.stringify(pages))).toEqual([
    { filename: 'packages/core/src/a.ts', status: 'modified' },
    { filename: '.changeset/note.md', status: 'added' },
  ])
})
