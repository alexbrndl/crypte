import { expect, test } from 'vitest'
import { decide, filesOf } from './changeset-check.mjs'

function touche(...noms) {
  return noms.map((filename) => ({ filename, status: 'modified' }))
}

test('du code publié sans note ne passe pas', () => {
  expect(decide(touche('packages/core/src/protocol/story.ts')).ok).toBe(false)
  expect(decide(touche('packages/cli/package.json')).ok).toBe(false)
})

test('du code publié avec une note passe', () => {
  const avec = touche('packages/core/src/protocol/story.ts', '.changeset/tidy-moons-shake.md')

  expect(decide(avec)).toEqual({
    published: ['packages/core/src/protocol/story.ts'],
    notes: ['.changeset/tidy-moons-shake.md'],
    ok: true,
  })
})

test('ce qui n’est pas publié ne demande aucune note', () => {
  const ailleurs = touche(
    'docs/architecture.md',
    '.github/workflows/ci.yml',
    'test/post-review.mjs',
    'apps/shell/src/App.vue',
    'packages/core/test/protocol/story.test.ts',
    'packages/core/vite.config.ts',
    'CLAUDE.md',
  )

  expect(decide(ailleurs)).toEqual({ published: [], notes: [], ok: true })
})

test('les fichiers du dossier .changeset ne sont pas tous des notes', () => {
  const faux = [
    ...touche('packages/core/src/index.ts'),
    ...touche('.changeset/README.md', '.changeset/config.json', '.changeset/sous/dossier.md'),
  ]

  expect(decide(faux).notes).toEqual([])
  expect(decide(faux).ok).toBe(false)
})

test('une note supprimée n’est pas une note', () => {
  const retiree = [
    ...touche('packages/react/src/index.ts'),
    { filename: '.changeset/lot-2-protocole.md', status: 'removed' },
  ]

  expect(decide(retiree).ok).toBe(false)
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
