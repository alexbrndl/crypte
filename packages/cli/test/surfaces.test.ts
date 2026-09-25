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
    ['a URL object, without its `href`', 'objet'],
  ] as const)('refuses %s', ([, pointer]) => {
    // Construits ici : la table est lue avant que `beforeAll` crée le dossier.
    const shell =
      pointer === 'plain'
        ? join(dossier, 'shell.mjs')
        : pointer === 'objet'
          ? new URL(url('shell.mjs'))
          : pointer

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

  // `stat` lève sur ces deux-là au lieu de dire que rien n'est là, et la levée
  // arrêtait `crypte dev` au démarrage.
  it('refuses a file URL that the system cannot even look up', () => {
    const long = join(dossier, `${'a'.repeat(300)}.mjs`)

    expect(
      avec({ name: 'p', shell: pathToFileURL(long).href, preview: 'file:///x%00.mjs' }).refused,
    ).toEqual([
      { plugin: 'p', reason: `\`shell\` points at ${long}, which is not a file` },
      { plugin: 'p', reason: '`preview` points at /x\0.mjs, which is not a file' },
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

  // Le shell retient l'ouverture d'un panneau sous le nom de son plugin : deux
  // plugins d'un même nom la partageraient. Le premier garde sa place.
  it('refuses the browser surfaces of a plugin whose name is already taken', () => {
    expect(
      avec(
        { name: 'a', node: { entries: () => [] } },
        { name: 'b', shell: url('shell.mjs') },
        { name: 'a', shell: url('shell.mjs') },
        { name: 'b', preview: url('preview.mjs') },
        // Sans surface navigateur, rien à refuser ici.
        { name: 'b', node: { entries: () => [] } },
      ),
    ).toEqual({
      shell: [{ plugin: 'b', file: join(dossier, 'shell.mjs') }],
      preview: [],
      refused: [
        { plugin: 'a', reason: '`name` is already taken by an earlier plugin' },
        { plugin: 'b', reason: '`name` is already taken by an earlier plugin' },
      ],
    })
  })

  it('refuses the browser surfaces of a plugin without a name, by its place', () => {
    const sansNom = { shell: url('shell.mjs') } as unknown as CryptePlugin

    expect(
      avec(sansNom, { name: '', preview: url('preview.mjs') }, {
        node: { entries: () => [] },
      } as unknown as CryptePlugin),
    ).toEqual({
      shell: [],
      preview: [],
      refused: [
        {
          plugin: 'plugins[0]',
          reason: 'a plugin with a browser surface needs a `name`, which keys its panel',
        },
        {
          plugin: 'plugins[1]',
          reason: 'a plugin with a browser surface needs a `name`, which keys its panel',
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
