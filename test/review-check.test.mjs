// Le classement décide si une revue est exigée. Ce qu'il laisse passer par erreur
// rend vert un contrôle qui ne vérifie plus rien, d'où les cas négatifs.
// Voir docs/internal/architecture.md.

import { expect, test } from 'vitest'
import { decide, marked } from './review-check.mjs'

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
  expect(prose('docs/internal/suivi.md')).toBe(false)
  expect(prose('CLAUDE.md')).toBe(false)
  expect(prose('.claude/skills/review/SKILL.md')).toBe(false)
})

test('un seul fichier qui fait foi suffit à exiger la revue', () => {
  expect(prose('README.md', 'docs/guide.md', 'docs/decisions.md')).toBe(false)
})

test('les dossiers comptent comme les fichiers, pour que scinder ne relâche rien', () => {
  expect(prose('docs/contracts/section-6.md')).toBe(false)
  expect(prose('docs/decisions/2026-08.md')).toBe(false)
  expect(prose('docs/internal/suivi/important.md')).toBe(false)
})

test('CLAUDE.md compte à toute profondeur', () => {
  expect(prose('packages/core/CLAUDE.md')).toBe(false)
  expect(prose('apps/shell/CLAUDE.md')).toBe(false)
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
