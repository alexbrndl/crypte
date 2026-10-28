// `crypte visual` de bout en bout, sur une copie de la démonstration : les
// baselines écrites, une capture identique au tour suivant, et ce qui diffère.

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
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

  // Une story dans un dossier porte un `/` dans son id (4.3) : sa baseline dans
  // un sous-dossier, retirée avec elle. Et une story qui ne dessine rien se
  // capture quand même, au lieu d'attendre un élément qui ne vient pas.
  test('keeps the baseline of a story in a folder, and captures one that draws nothing', async () => {
    // Sans le cadre global de la démo, qui dessinerait autour de rien.
    const config = join(root, 'crypte.config.ts')
    const avecCadre = readFileSync(config, 'utf8')
    writeFileSync(config, avecCadre.replace('  wrap: Panel,\n', ''))
    const rien = join(root, 'src', 'components', 'Rien.tsx')
    const dossier = join(root, 'stories', 'forms')
    writeFileSync(rien, 'export function Rien() { return null }\n')
    mkdirSync(dossier, { recursive: true })
    writeFileSync(
      join(dossier, 'Rien.tsx'),
      "import { defineStories } from '@crypte/react'\nimport { Rien } from '@/components/Rien'\n\nexport default defineStories(Rien)\n",
    )

    expect((await lance(true)).code).toBe(0)
    const imbriquées = readdirSync(join(root, BASELINES, 'forms'))
    expect(imbriquées).toHaveLength(1)
    expect((await lance(false)).code).toBe(0)

    rmSync(dossier, { recursive: true })
    rmSync(rien)
    writeFileSync(config, avecCadre)
    expect((await lance(true)).code).toBe(0)
    expect(existsSync(join(root, BASELINES, 'forms'))).toBe(false)
  }, 240_000)

  // Renommée dans un dépôt où l'empreinte et les baselines sont commitées :
  // la sortie propose de reprendre la baseline, avant comme après le commit du
  // renommage, celui que la CI compare. Rien n'est déplacé.
  test('proposes to keep the baseline of a renamed story, and moves nothing', async () => {
    expect((await lance(true)).code).toBe(0)
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
        { cwd: root, stdio: 'ignore' },
      )
    git('init', '-q')
    git('add', '.crypte')
    git('commit', '-q', '-m', 'x')

    const story = join(root, 'stories', 'Badge.tsx')
    const saine = readFileSync(story, 'utf8')
    writeFileSync(story, saine.replace('Avertissement:', 'Alerte:'))
    const proposée =
      '  badge--alerte: no baseline, probably badge--avertissement renamed: git mv .crypte/visual/badge--avertissement.png .crypte/visual/badge--alerte.png keeps its baseline'
    for (const commité of [false, true]) {
      if (commité) {
        git('add', '.crypte/fingerprint.json')
        git('commit', '-q', '-m', 'renommée')
      }
      const { code, lignes } = await lance(false)
      expect(code).toBe(1)
      expect(lignes).toContain(proposée)
      expect(lignes.some((ligne) => ligne.includes('a baseline with no story'))).toBe(false)
      expect(existsSync(join(root, BASELINES, 'badge--avertissement.png'))).toBe(true)
    }

    writeFileSync(story, saine)
    rmSync(join(root, '.git'), { recursive: true, force: true })
    expect((await lance(true)).code).toBe(0)
  }, 240_000)

  // Au premier lancement, aucune baseline : une ligne qui le dit, pas une par
  // story, ni « differ » pour ce qui n'a rien avec quoi différer.
  test('says there is no baseline yet on a first run', async () => {
    rmSync(join(root, BASELINES), { recursive: true, force: true })
    expect(await lance(false)).toEqual({
      code: 1,
      lignes: ['No baseline yet in .crypte/visual: crypte visual --update writes one per story'],
    })
    expect((await lance(true)).code).toBe(0)
  }, 240_000)
})
