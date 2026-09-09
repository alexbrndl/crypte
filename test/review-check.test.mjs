// Le classement décide si une revue est exigée. Ce qu'il laisse passer par erreur
// rend vert un contrôle qui ne vérifie plus rien, d'où les cas négatifs.
// Voir docs/internal/architecture.md.

import { expect, test } from 'vitest'
import { changedSince, decide, filesOf, marked, reviewsOf } from './review-check.mjs'

const prose = (...files) => decide(files).prose

test('de la prose seule ne demande pas de revue', () => {
  expect(prose('README.md')).toBe(true)
  expect(prose('README.md', 'docs/guide.md', 'docs/internal/architecture.md')).toBe(true)
  expect(prose('.changeset/petit-chien-danse.md')).toBe(true)
  expect(prose('CONTRIBUTING.md')).toBe(true)
})

test('ce qui fait foi demande une revue, malgré son extension', () => {
  expect(prose('docs/contracts.md')).toBe(false)
  expect(prose('docs/decisions.md')).toBe(false)
  expect(prose('CLAUDE.md')).toBe(false)
  expect(prose('.claude/skills/review/SKILL.md')).toBe(false)
})

test('un seul fichier qui fait foi suffit à exiger la revue', () => {
  expect(prose('README.md', 'docs/guide.md', 'docs/decisions.md')).toBe(false)
})

test('les dossiers comptent comme les fichiers, pour que scinder ne relâche rien', () => {
  expect(prose('docs/contracts/section-6.md')).toBe(false)
  expect(prose('docs/decisions/2026-08.md')).toBe(false)
})

test('CLAUDE.md compte à toute profondeur', () => {
  expect(prose('packages/core/CLAUDE.md')).toBe(false)
  expect(prose('apps/shell/CLAUDE.md')).toBe(false)
})

// Les skills à portée de dossier sont une forme supportée : ancrer `.claude/` à la
// seule racine laissait le mécanisme de revue se modifier sans revue d'un niveau
// plus bas. Constat de la seconde revue de la PR 47.
test('un dossier .claude compte à toute profondeur, pas seulement à la racine', () => {
  expect(prose('.claude/skills/review/SKILL.md')).toBe(false)
  expect(prose('apps/shell/.claude/skills/deploy/SKILL.md')).toBe(false)
  expect(prose('packages/cli/.claude/settings.json')).toBe(false)
})

test('un nom qui contient claude sans être le dossier reste de la prose', () => {
  expect(prose('docs/claude.md')).toBe(true)
  expect(prose('docs/notes-claude.md')).toBe(true)
})

test('tout ce qui n_est pas markdown demande une revue', () => {
  expect(prose('packages/cli/src/dev.ts')).toBe(false)
  expect(prose('.github/workflows/ci.yml')).toBe(false)
  expect(prose('package.json')).toBe(false)
  expect(prose('apps/shell/src/App.vue')).toBe(false)
})

test('un seul fichier de code suffit à exiger la revue', () => {
  expect(prose('README.md', 'packages/cli/src/dev.ts')).toBe(false)
})

test('un nom qui finit par autre chose que .md n_est pas de la prose', () => {
  expect(prose('README.md.ts')).toBe(false)
  expect(prose('notes.markdown')).toBe(false)
})

test('une liste vide exige la revue plutôt que de l_exempter', () => {
  expect(decide([])).toEqual({ prose: false, why: 'aucun fichier lu' })
})

test('la raison dit ce qui a décidé, sans lister la prose', () => {
  expect(decide(['docs/decisions.md']).why).toBe('fait foi')
  expect(decide(['packages/cli/src/dev.ts']).why).toBe('pas de la prose')
  expect(decide(['README.md']).why).toBe('prose seule')
})

test('ce qui fait foi est signalé avant le code, pour que la raison soit la plus forte', () => {
  const d = decide(['docs/decisions.md', 'packages/cli/src/dev.ts'])
  expect(d).toMatchObject({ prose: false, why: 'fait foi', authority: ['docs/decisions.md'] })
})

test('le marqueur est cherché tel quel, et un corps absent ne compte pas', () => {
  const bodies = [
    '<!-- crypte-review -->\n## Revue',
    'un commentaire ordinaire',
    null,
    undefined,
    'préfixe <!-- crypte-review --> suffixe',
  ]

  expect(marked(bodies)).toHaveLength(2)
})

test('un marqueur approchant ne compte pas', () => {
  expect(
    marked(['<!-- crypte review -->', '<!--crypte-review-->', '<!-- Crypte-Review -->']),
  ).toEqual([])
})

// Le compte qui décide du vert vient de deux points d'API : l'éprouver demande le
// paramètre d'injection, comme `changeset-check.test.mjs` le fait pour le sien.
const api =
  ({ comments = [], reviews = [] }) =>
  (args) =>
    JSON.stringify([args[1].includes('/comments') ? comments : reviews])

test('les pages de l_API sont aplaties', () => {
  const run = () => JSON.stringify([[{ filename: 'a.md' }], [{ filename: 'b.ts' }]])

  expect(filesOf('47', 'alexbrndl/crypte', run)).toEqual(['a.md', 'b.ts'])
})

test('le compte additionne les commentaires et les revues marqués', () => {
  const run = api({
    comments: [{ body: '<!-- crypte-review -->' }, { body: 'autre chose' }],
    reviews: [{ body: '<!-- crypte-review -->', submitted_at: '2026-08-22T10:00:00Z' }],
  })

  expect(reviewsOf('47', 'alexbrndl/crypte', run).count).toBe(2)
})

test('sans marqueur, le compte est nul et la date vide', () => {
  const run = api({ comments: [{ body: 'rien' }], reviews: [{ body: 'rien non plus' }] })

  expect(reviewsOf('47', 'alexbrndl/crypte', run)).toEqual({ count: 0, latest: '' })
})

test('la date retenue est celle de la revue marquée la plus récente', () => {
  const run = api({
    reviews: [
      { body: '<!-- crypte-review -->', submitted_at: '2026-08-20T10:00:00Z' },
      { body: '<!-- crypte-review -->', submitted_at: '2026-08-22T10:00:00Z' },
      { body: 'non marquée', submitted_at: '2026-08-23T10:00:00Z' },
    ],
  })

  expect(reviewsOf('47', 'alexbrndl/crypte', run).latest).toBe('2026-08-22T10:00:00Z')
})

test('un commentaire marqué ne fournit pas de date, seule une revue ancrée en donne', () => {
  const run = api({ comments: [{ body: '<!-- crypte-review -->' }] })
  const { count, latest } = reviewsOf('47', 'alexbrndl/crypte', run)

  expect({ count, latest }).toEqual({ count: 1, latest: '' })
})

// Une revue plus ancienne que le dernier commit n'est pas fautive : corriger un
// point non bloquant sans relancer de tour est permis. Ce qui ne l'est pas est
// d'ajouter du code exécutable ensuite. Séparer les deux demande de savoir ce qui
// a bougé **depuis** la revue, et c'est ce que ces cas tiennent.
const COMMITS = [
  {
    sha: 'aaa',
    commit: { committer: { date: '2026-08-20T10:00:00Z' } },
    parents: [{ sha: 'zzz' }],
  },
  {
    sha: 'bbb',
    commit: { committer: { date: '2026-08-22T10:00:00Z' } },
    parents: [{ sha: 'aaa' }],
  },
  {
    sha: 'ccc',
    commit: { committer: { date: '2026-08-24T10:00:00Z' } },
    parents: [{ sha: 'bbb' }],
  },
]

const depuis = (files) => (args) =>
  args[1].includes('/commits')
    ? JSON.stringify([COMMITS])
    : JSON.stringify({ files: files.map((filename) => ({ filename })) })

test('ne rend que les fichiers des commits postérieurs à la revue', () => {
  const vus = []
  const run = (args) => {
    vus.push(args[1])

    return depuis(['docs/guide.md'])(args)
  }

  expect(changedSince('47', 'o/r', '2026-08-22T10:00:00Z', run)).toEqual(['docs/guide.md'])

  // La base est le dernier commit à la date de la revue ou avant, la tête le
  // dernier de la pull request : sans ça la comparaison reprend tout le diff.
  expect(vus.at(-1)).toBe('repos/o/r/compare/bbb...ccc')
})

test('quand la revue précède tous les commits, la comparaison part du parent', () => {
  const vus = []
  const run = (args) => {
    vus.push(args[1])

    return depuis(['packages/core/src/x.ts'])(args)
  }

  changedSince('47', 'o/r', '2026-08-01T00:00:00Z', run)

  expect(vus.at(-1)).toBe('repos/o/r/compare/zzz...ccc')
})

test('rien de postérieur à la revue rend une liste vide, sans comparaison', () => {
  const vus = []
  const run = (args) => {
    vus.push(args[1])

    return depuis([])(args)
  }

  expect(changedSince('47', 'o/r', '2026-08-24T10:00:00Z', run)).toEqual([])
  expect(vus.some((one) => one.includes('/compare/'))).toBe(false)
})

// La moitié qui compte : ce qui a bougé depuis se classe par le même juge que le
// diff entier, donc une correction de prose passe et du code exécutable non.
test('ce qui a bougé depuis la revue se classe comme le reste', () => {
  expect(decide(['docs/guide.md']).prose).toBe(true)
  expect(decide(['README.md', 'docs/internal/architecture.md']).prose).toBe(true)
  expect(decide(['packages/cli/src/dev.ts']).prose).toBe(false)
  expect(decide(['test/review-check.mjs']).prose).toBe(false)
  expect(decide(['docs/decisions.md']).prose).toBe(false)
})
