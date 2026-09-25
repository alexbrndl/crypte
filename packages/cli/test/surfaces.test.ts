import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { CryptePlugin } from '@crypte/core/protocol'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildCatalogue } from '../src/manifest'
import { loadProject, type Project } from '../src/project'
import { surfacesOf } from '../src/surfaces'

// Où vivent les surfaces navigateur d'un plugin, et ce qui en est refusé.
// Section 6.1 de docs/contracts.md.

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixture')

let dossier: string
let project: Project

beforeAll(async () => {
  dossier = mkdtempSync(join(tmpdir(), 'crypte-surfaces-'))
  writeFileSync(join(dossier, 'shell.mjs'), 'export default {}\n')
  writeFileSync(join(dossier, 'preview.mjs'), '\n')
  mkdirSync(join(dossier, 'dossier.mjs'))

  project = await loadProject(fixture)
})

afterAll(() => {
  rmSync(dossier, { recursive: true, force: true })
})

// Le vrai projet, avec des plugins injectés, comme `contributions.test.ts`.
const avec = (...plugins: CryptePlugin[]) => {
  project.config.plugins = plugins
  return surfacesOf(project)
}

const url = (name: string) => pathToFileURL(join(dossier, name)).href

const MAL_FORME =
  "`shell` must be the file URL of a module, `new URL('./shell.mjs', import.meta.url).href`"

describe('the browser surfaces of a plugin', () => {
  it('reads both, in configuration order', () => {
    expect(
      avec(
        { name: 'a', shell: url('shell.mjs') },
        { name: 'b', shell: url('shell.mjs'), preview: url('preview.mjs') },
      ),
    ).toEqual({
      shell: [
        { plugin: 'a', file: join(dossier, 'shell.mjs') },
        { plugin: 'b', file: join(dossier, 'shell.mjs') },
      ],
      preview: [{ plugin: 'b', file: join(dossier, 'preview.mjs') }],
      refused: [],
    })
  })

  it('reads nothing from a plugin that declares neither', () => {
    expect(avec({ name: 'node-only', node: { entries: () => [] } })).toEqual({
      shell: [],
      preview: [],
      refused: [],
    })
  })
})

describe('what a surface is refused', () => {
  // Un chemin, même d'un fichier qui existe : il se résoudrait contre un dossier
  // que le plugin n'a pas choisi.
  it.for([
    ['a relative path', './shell.mjs'],
    ['a plain path', 'plain'],
    ['a URL other than file:', 'https://example.com/shell.mjs'],
    ['a value other than a string', 42],
  ] as const)('refuses %s', ([, pointer]) => {
    const shell = pointer === 'plain' ? join(dossier, 'shell.mjs') : pointer

    expect(avec({ name: 'p', shell: shell as string })).toEqual({
      shell: [],
      preview: [],
      refused: [{ plugin: 'p', reason: MAL_FORME }],
    })
  })

  it('refuses a file URL that leads to no file', () => {
    expect(
      avec({ name: 'p', shell: url('absent.mjs'), preview: url('dossier.mjs') }).refused,
    ).toEqual([
      {
        plugin: 'p',
        reason: `\`shell\` points at ${join(dossier, 'absent.mjs')}, which is not a file`,
      },
      {
        plugin: 'p',
        reason: `\`preview\` points at ${join(dossier, 'dossier.mjs')}, which is not a file`,
      },
    ])
  })

  // Chaque surface pour soi : celle qui ne mène nulle part ne coûte pas l'autre.
  it('keeps the surface that points at a file when the other does not', () => {
    expect(avec({ name: 'p', shell: url('shell.mjs'), preview: url('absent.mjs') })).toEqual({
      shell: [{ plugin: 'p', file: join(dossier, 'shell.mjs') }],
      preview: [],
      refused: [
        {
          plugin: 'p',
          reason: `\`preview\` points at ${join(dossier, 'absent.mjs')}, which is not a file`,
        },
      ],
    })
  })

  // Le seul chemin par lequel un refus atteint le terminal : `crypte dev`
  // imprime `skippedPlugins`, et rien d'autre.
  it('reports a refusal with the refused contributions', () => {
    project.config.plugins = [{ name: 'p', shell: url('absent.mjs') }]

    expect(buildCatalogue(project).skippedPlugins).toEqual([
      {
        plugin: 'p',
        reason: `\`shell\` points at ${join(dossier, 'absent.mjs')}, which is not a file`,
      },
    ])
  })
})
