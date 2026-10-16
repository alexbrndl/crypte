import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { tokensOf } from '../src/catalogue/tokens'

// Les propriétés personnalisées qu'un composant lit, section 4.2 des contrats.

const roots: string[] = []

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

// Un dossier jetable, chaque fichier écrit à son chemin relatif.
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'crypte-component-tokens-'))
  roots.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

describe('the custom properties a component reads', () => {
  it('reads each var() of the file, sorted, once each', () => {
    const root = project({
      'Badge.tsx': `export const Badge = () => <span style={{ color: 'var(--text)', background: 'var(--background, #fff)', border: 'var( --text)' }} />`,
    })

    expect(tokensOf(join(root, 'Badge.tsx'))).toEqual(['background', 'text'])
  })

  // `var(${tone ? '--a' : '--b'})` choisit sa propriété dans une chaîne.
  it('reads a quoted name in the component file', () => {
    const root = project({
      'Badge.tsx': 'const v = `var(${warning ? \'--color-warning\' : "--color-neutral"})`',
    })

    expect(tokensOf(join(root, 'Badge.tsx'))).toEqual(['color-neutral', 'color-warning'])
  })

  it('reads a quoted name in a var() template that carries a fallback', () => {
    const root = project({ 'Badge.tsx': "const v = `var(${tone ? '--a' : '--b'}, #000)`" })

    expect(tokensOf(join(root, 'Badge.tsx'))).toEqual(['a', 'b'])
  })

  it('reads the style sheets the file imports by a relative path, one level deep', () => {
    const root = project({
      'ui/Badge.tsx': `import './badge.css'\nimport styles from '../shared/badge.module.scss'\nimport 'library/theme.css'`,
      'ui/badge.css': `@import './deeper.css';\n.badge { color: var(--text); }`,
      'ui/deeper.css': `.x { color: var(--deeper); }`,
      'shared/badge.module.scss': `.badge { padding: var(--space-2); --local: '--quoted'; }`,
    })

    expect(tokensOf(join(root, 'ui/Badge.tsx'))).toEqual(['space-2', 'text'])
  })

  // Dans une feuille, une chaîne entre guillemets n'est pas une lecture : seul
  // `var(` en est une, qui se lit aussi dans le `<style>` d'un composant Vue.
  it('reads the style block of a single-file component', () => {
    const root = project({
      'Badge.vue': `<template><span class="badge" /></template>\n<style scoped>\n.badge { color: var(--text-primary); }\n</style>`,
    })

    expect(tokensOf(join(root, 'Badge.vue'))).toEqual(['text-primary'])
  })

  // Une chaîne `--mot` hors d'un `var(${…})` n'est pas une lecture : une classe,
  // une option de ligne de commande, ou un contenu CSS dans le `<style>` d'un .vue.
  it('reads no quoted name outside a var() template', () => {
    const root = project({
      'Badge.tsx': "cx('badge', { '--primary': p })\nprogram.option('--verbose')",
      'Badge.vue': "<style>\n.a::after { content: '--quoted'; }\n</style>",
    })

    expect(tokensOf(join(root, 'Badge.tsx'))).toEqual([])
    expect(tokensOf(join(root, 'Badge.vue'))).toEqual([])
  })

  it('reads a sheet imported with a Vite query, or linked by <style src>', () => {
    const root = project({
      'Badge.tsx': "import styles from './badge.css?inline'",
      'badge.css': '.badge { color: var(--inline); }',
      'Card.vue': '<template><div /></template>\n<style scoped src="./card.css"></style>',
      'card.css': '.card { color: var(--linked); }',
    })

    expect(tokensOf(join(root, 'Badge.tsx'))).toEqual(['inline'])
    expect(tokensOf(join(root, 'Card.vue'))).toEqual(['linked'])
  })

  it('reads none from a component that reads none, and skips a sheet that is not there', () => {
    const root = project({ 'Badge.tsx': `import './absente.css'\nexport const Badge = () => null` })

    expect(tokensOf(join(root, 'Badge.tsx'))).toEqual([])
  })

  it('says nothing of a component file it cannot read', () => {
    expect(tokensOf(join(project({}), 'Absent.tsx'))).toBeUndefined()
  })
})
