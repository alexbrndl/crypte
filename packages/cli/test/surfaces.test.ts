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
      plugins: ['a', 'b'],
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
      plugins: ['node-only'],
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
      plugins: ['p'],
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
      plugins: ['p'],
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
      plugins: ['a', 'b'],
      shell: [{ plugin: 'b', file: join(dossier, 'shell.mjs') }],
      preview: [],
      refused: [
        { plugin: 'a', reason: '`name` is already taken by an earlier plugin' },
        { plugin: 'b', reason: '`name` is already taken by an earlier plugin' },
      ],
    })
  })

  // La place dans la configuration décide, pas l'état des surfaces : un premier
  // plugin au pointeur cassé garde son nom, et son homonyme n'apparaît pas à sa
  // place sans que personne l'ait choisi.
  it('keeps the name of a first plugin whose surface is refused', () => {
    expect(
      avec({ name: 'a', shell: url('absent.mjs') }, { name: 'a', shell: url('shell.mjs') }),
    ).toEqual({
      plugins: ['a'],
      shell: [],
      preview: [],
      refused: [
        {
          plugin: 'a',
          reason: `\`shell\` points at ${join(dossier, 'absent.mjs')}, which is not a file`,
        },
        { plugin: 'a', reason: '`name` is already taken by an earlier plugin' },
      ],
    })
  })

  // Le préfixe d'un message s'arrête au premier deux-points : `a:b:run` irait à
  // un plugin nommé `a`. Mesuré, le message n'atteignait personne.
  it('refuses the browser surfaces of a plugin whose name holds a colon', () => {
    expect(avec({ name: 'mon:plugin', preview: url('preview.mjs') })).toEqual({
      plugins: [],
      shell: [],
      preview: [],
      refused: [
        {
          plugin: 'mon:plugin',
          reason: '`name` holds a colon, which ends the prefix of its messages',
        },
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
      plugins: [],
      shell: [],
      preview: [],
      refused: [
        {
          plugin: 'plugins[0]',
          reason: 'a plugin with a browser surface needs a `name`',
        },
        {
          plugin: 'plugins[1]',
          reason: 'a plugin with a browser surface needs a `name`',
        },
      ],
    })
  })

  // Un plugin arrive compilé : une clé que le contrat ne connaît pas, une surface
  // à venir ou l'ancien `ui`, était ignorée sans un mot. Le reste du plugin
  // compte toujours. DCJ-194.
  it('refuses each key a plugin does not have, and keeps the rest', () => {
    expect(
      avec(
        {
          name: 'p',
          shell: url('shell.mjs'),
          toolbar: './x.mjs',
          ui: './y.mjs',
        } as unknown as CryptePlugin,
        { toolbar: './x.mjs' } as unknown as CryptePlugin,
        null as unknown as CryptePlugin,
      ),
    ).toEqual({
      plugins: ['p'],
      shell: [{ plugin: 'p', file: join(dossier, 'shell.mjs') }],
      preview: [],
      refused: [
        {
          plugin: 'p',
          reason: '`toolbar` is not a key of a plugin, which are name, shell, preview and node',
        },
        {
          plugin: 'p',
          reason: '`ui` is not a key of a plugin, which are name, shell, preview and node',
        },
        {
          plugin: 'plugins[1]',
          reason: '`toolbar` is not a key of a plugin, which are name, shell, preview and node',
        },
      ],
    })
  })

  // `plugins: [controls]`, la fabrique elle-même : elle compile, une fonction a
  // un `name`, et ne faisait rien sans un mot. Audit à froid du projet 1.3.
  it('refuses a factory passed without being called', () => {
    function controls(): CryptePlugin {
      return { name: 'controls', shell: url('shell.mjs') }
    }

    expect(
      avec(controls as unknown as CryptePlugin, (() => ({})) as unknown as CryptePlugin),
    ).toEqual({
      plugins: [],
      shell: [],
      preview: [],
      refused: [
        { plugin: 'plugins[0]', reason: 'a function, not a plugin: call it, `controls()`' },
        { plugin: 'plugins[1]', reason: 'a function, not a plugin: call it, `the factory()`' },
      ],
    })
  })

  // Une clé qu'un objet hérite, que `in` aurait prise pour une clé de plugin.
  it('refuses a key every object inherits', () => {
    expect(avec({ name: 'p', toString: 'x' } as unknown as CryptePlugin).refused).toEqual([
      {
        plugin: 'p',
        reason: '`toString` is not a key of a plugin, which are name, shell, preview and node',
      },
    ])
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
