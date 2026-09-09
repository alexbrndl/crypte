import { expect, test } from 'vitest'
import { commentsOnly, decide, filesOf } from './changeset-check.mjs'

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

// Le cas qui a fait échouer ce contrôle à son premier vrai usage : un chemin de
// documentation corrigé dans deux commentaires de code publié.
test('un fichier publié dont seuls les commentaires changent n’exige aucune note', () => {
  const patch =
    '@@ -25,7 +25,7 @@\n-// dans `resolve.alias`. Voir architecture.md.\n+// dans `resolve.alias`. Voir docs/internal/architecture.md.\n const PROTOCOL ='

  expect(decide([{ filename: 'packages/cli/src/paths.ts', status: 'modified', patch }])).toEqual({
    published: [],
    notes: [],
    ok: true,
  })
})

test('ce qui compte comme un changement de commentaire', () => {
  expect(commentsOnly('@@\n-// avant\n+// après\n')).toBe(true)
  expect(commentsOnly('@@\n+\n-\n')).toBe(true)

  // Mesuré : un bloc `/** */` sur un type exporté se retrouve dans le `.d.ts`
  // publié, là où un `//` en est retiré. Il change donc ce que l'utilisateur
  // reçoit, et il exige une note.
  expect(commentsOnly('@@\n+/**\n+ * documente un type public\n+ */\n')).toBe(false)

  expect(commentsOnly('@@\n-// avant\n+const x = 1\n')).toBe(false)
  expect(commentsOnly('@@\n context inchangé\n')).toBe(false)

  // Sans patch, l'API n'en fournissant pas au-delà d'une certaine taille, on
  // exige la note : le sens sûr est de bloquer, pas de laisser passer.
  expect(commentsOnly(undefined)).toBe(false)
  expect(commentsOnly('')).toBe(false)
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
  // `apps/shell` était dans cette liste et n'y est plus : son build voyage dans
  // `packages/cli/dist/shell`, que la tarball emporte. Vérifié par
  // `pnpm pack --dry-run`, qui liste `dist/shell/index.html` et ses deux assets.
  const ailleurs = touche(
    'docs/internal/architecture.md',
    '.github/workflows/ci.yml',
    'test/post-review.mjs',
    'apps/demo/src/components/Tag.tsx',
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
    { filename: 'packages/core/src/a.ts', status: 'modified', patch: '@@' },
    { filename: '.changeset/note.md', status: 'added', patch: '@@' },
  ])
})

// Un commentaire directif a la forme d'un commentaire et l'effet d'une ligne de
// code : l'exempter laissait un changement de compilation passer sans note.
test('un commentaire directif n’est pas inerte', () => {
  const patch = (line) => `@@ -1,1 +1,2 @@\n unchanged\n+${line}`

  expect(commentsOnly(patch('// une phrase ordinaire'))).toBe(true)

  expect(commentsOnly(patch('  // @ts-expect-error la surface a bougé'))).toBe(false)
  expect(commentsOnly(patch('// @ts-ignore'))).toBe(false)
  expect(commentsOnly(patch('// @ts-nocheck'))).toBe(false)
  expect(commentsOnly(patch('// eslint-disable-next-line no-restricted-imports'))).toBe(false)
  expect(commentsOnly(patch('// oxlint-disable-next-line'))).toBe(false)
  expect(commentsOnly(patch('// prettier-ignore'))).toBe(false)
  expect(commentsOnly(patch('// v8 ignore next'))).toBe(false)
  expect(commentsOnly(patch('/// <reference types="node" />'))).toBe(false)
})

// Retirer une directive compte autant que l'ajouter : c'est le sens qui casse la
// compilation plutôt que celui qui la fait taire.
test('retirer une directive compte aussi', () => {
  expect(commentsOnly('@@ -1,2 +1,1 @@\n unchanged\n-// @ts-expect-error')).toBe(false)
})

// Le shell n'est pas un paquet, et il est pourtant publié : son build est copié
// dans `packages/cli/dist/shell`, que `files: ["dist"]` emporte. Le contrôle
// rendait `ok` sur une modification qui part chez l'utilisateur. Mesuré.
test('le shell compte, parce qu’il voyage dans le paquet du CLI', () => {
  const change = (filename) => decide([{ filename, patch: '@@\n+const x = 1' }])

  expect(change('apps/shell/src/App.vue').ok).toBe(false)
  expect(change('apps/shell/src/recover.ts').ok).toBe(false)
  expect(change('apps/shell/package.json').ok).toBe(false)
  expect(change('apps/shell/vite.config.ts').ok).toBe(false)
})

// La moitié qui compte : `apps/demo` ne voyage nulle part, donc il ne doit rien
// exiger. Le prendre aussi ferait demander une note pour une fixture.
test('la démonstration ne compte pas, rien d’elle n’étant publié', () => {
  const change = (filename) => decide([{ filename, patch: '@@\n+const x = 1' }])

  expect(change('apps/demo/src/components/Tag.tsx').ok).toBe(true)
  expect(change('apps/demo/stories/Badge.tsx').ok).toBe(true)
  expect(change('apps/demo/package.json').ok).toBe(true)
})
