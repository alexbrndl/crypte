// `crypte visual` de bout en bout, sur une copie de la démonstration : les
// baselines écrites, une capture identique au tour suivant, et ce qui diffère.

import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { BASELINES, DIFFERENT, visual } from '../src/commands/visual'

const demo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'demo')
let root = ''

beforeAll(() => {
  root = mkdtempSync(join(demo, '..', 'tmp-demo-'))
  cpSync(demo, root, { recursive: true })
  rmSync(join(root, 'node_modules', '.crypte'), { recursive: true, force: true })
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

const lance = async (update: boolean) => {
  const lignes: string[] = []
  const code = await visual(root, update, (line) => lignes.push(line))
  return { code, lignes }
}

describe('crypte visual', () => {
  test('writes a baseline per story, then finds every one identical', async () => {
    const écrit = await lance(true)
    const baselines = readdirSync(join(root, BASELINES)).sort()
    expect(baselines.length).toBeGreaterThan(0)
    expect(baselines.every((name) => name.endsWith('.png'))).toBe(true)
    expect(écrit).toEqual({
      code: 0,
      lignes: [`${baselines.length} baselines written to .crypte/visual`],
    })

    // Deux rendus de la même story sur la même machine : les mêmes octets.
    expect(await lance(false)).toEqual({
      code: 0,
      lignes: [`${baselines.length} stories match their baselines`],
    })
    expect(existsSync(join(root, DIFFERENT))).toBe(false)
  }, 120_000)

  // Une story changée est écrite à côté, une baseline manquante et une baseline
  // sans story sont dites ; la mise à jour range tout.
  test('says what differs, what has no baseline and what is left over, and updates', async () => {
    // Ses propres baselines d'abord : l'ordre des cas est tiré au sort.
    expect((await lance(true)).code).toBe(0)
    const story = join(root, 'stories', 'Badge.tsx')
    const saine = readFileSync(story, 'utf8')
    writeFileSync(
      story,
      readFileSync(story, 'utf8').replace("label: 'Nouveau'", "label: 'Nouveau !'"),
    )
    rmSync(join(root, BASELINES, 'tag--nue.png'))
    writeFileSync(join(root, BASELINES, 'partie--x.png'), '')

    const { code, lignes } = await lance(false)
    expect(code).toBe(1)
    expect(lignes).toContain(
      '  badge--par-defaut: differs from its baseline, see crypte-visual/badge--par-defaut.png',
    )
    expect(lignes).toContain('  tag--nue: no baseline')
    expect(lignes).toContain('  partie--x: a baseline with no story')
    expect(lignes.at(-1)).toMatch(/^\d+ of \d+ stories differ: crypte visual --update writes them$/)
    expect(existsSync(join(root, DIFFERENT, 'badge--par-defaut.png'))).toBe(true)

    expect((await lance(true)).code).toBe(0)
    expect(existsSync(join(root, BASELINES, 'partie--x.png'))).toBe(false)
    expect((await lance(false)).code).toBe(0)
    writeFileSync(story, saine)
    expect((await lance(true)).code).toBe(0)
  }, 240_000)
})
