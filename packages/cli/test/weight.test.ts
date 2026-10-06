import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, test } from 'vitest'
import type { Surfaces } from '../src/surfaces'
import { pluginWeights, shellBytes } from '../src/weight'

// Ce que le shell et chaque plugin coûtent au navigateur, gzip niveau 9 fichier
// par fichier, la règle du budget du shell.

const dossiers: string[] = []

afterEach(() => {
  for (const one of dossiers.splice(0)) rmSync(one, { recursive: true, force: true })
})

// Un dossier jetable, rempli de ses fichiers ; rend le chemin de chacun.
const arbre = (fichiers: Record<string, string>) => {
  const racine = mkdtempSync(join(tmpdir(), 'crypte-poids-'))
  dossiers.push(racine)
  for (const [nom, contenu] of Object.entries(fichiers)) {
    mkdirSync(dirname(join(racine, nom)), { recursive: true })
    writeFileSync(join(racine, nom), contenu)
  }
  return (nom: string) => join(racine, nom)
}

const gz = (...fichiers: string[]) =>
  fichiers.reduce((total, one) => total + gzipSync(readFileSync(one), { level: 9 }).length, 0)

const surfaces = (partiel: Partial<Surfaces>): Surfaces => ({
  shell: [],
  preview: [],
  refused: [],
  plugins: [],
  ...partiel,
})

describe('the weight of the shell', () => {
  test('counts every file but the source maps', async () => {
    const chemin = arbre({
      'index.html': '<!doctype html><title>Crypte</title>',
      'assets/index.js': 'export const a = 1\n'.repeat(50),
      'assets/index.js.map': '{"mappings":"' + 'A'.repeat(5000) + '"}',
    })

    expect(await shellBytes(dirname(chemin('index.html')))).toBe(
      gz(chemin('index.html'), chemin('assets/index.js')),
    )
  })
})

describe('the weight of a plugin', () => {
  test('counts its modules and what they import, once each', async () => {
    const chemin = arbre({
      'dist/shell.mjs':
        "import { a } from './chunk.mjs'\nimport { ref } from 'vue'\nexport * from './tout.mjs'\nexport { b } from './nomme.mjs'\nexport default { a, ref }\n",
      'dist/chunk.mjs': "import './partage.mjs'\nexport const a = 1\n",
      'dist/tout.mjs': 'export const t = 1\n',
      'dist/nomme.mjs': 'export const b = 1\n',
      'dist/partage.mjs': 'export const p = 1\n',
      'dist/preview.mjs': "import 'dep/lourd.js'\nimport './partage.mjs'\nexport default {}\n",
      'node_modules/dep/package.json': '{ "name": "dep" }',
      'node_modules/dep/lourd.js': 'window.dep = 1;'.repeat(400),
      'node_modules/vue/package.json': '{ "name": "vue", "main": "index.js" }',
      'node_modules/vue/index.js': 'export const ref = 1;'.repeat(400),
    })

    const lu = await pluginWeights(
      surfaces({
        shell: [{ plugin: 'p', file: chemin('dist/shell.mjs') }],
        preview: [{ plugin: 'p', file: chemin('dist/preview.mjs') }],
        plugins: ['p'],
      }),
    )

    expect(lu).toEqual([
      {
        plugin: 'p',
        bytes: gz(
          ...['shell.mjs', 'chunk.mjs', 'tout.mjs', 'nomme.mjs', 'partage.mjs', 'preview.mjs'].map(
            (one) => chemin(`dist/${one}`),
          ),
          chemin('node_modules/dep/lourd.js'),
        ),
      },
    ])
  })

  // Un fichier que les deux modules importent est compté une fois, et suivi sous
  // la règle de chacun : la preview atteint ce que le shell n'atteint pas.
  test('follows a file both modules import under the rule of each', async () => {
    const chemin = arbre({
      'shell.mjs': "import './partage.mjs'\nexport default {}\n",
      'preview.mjs': "import './partage.mjs'\nexport default {}\n",
      'partage.mjs': "import 'dep/lourd.js'\nexport const p = 1\n",
      'node_modules/dep/package.json': '{ "name": "dep" }',
      'node_modules/dep/lourd.js': 'window.dep = 1;'.repeat(400),
    })

    expect(
      await pluginWeights(
        surfaces({
          shell: [{ plugin: 'p', file: chemin('shell.mjs') }],
          preview: [{ plugin: 'p', file: chemin('preview.mjs') }],
          plugins: ['p'],
        }),
      ),
    ).toEqual([
      {
        plugin: 'p',
        bytes: gz(
          chemin('shell.mjs'),
          chemin('preview.mjs'),
          chemin('partage.mjs'),
          chemin('node_modules/dep/lourd.js'),
        ),
      },
    ])
  })

  // Servi tel quel, un module shell n'atteint que ses imports relatifs : un nu
  // passe par l'import map, qui ne connaît que le `vue` du shell.
  test('leaves out what a shell module imports by a bare name', async () => {
    const chemin = arbre({
      'shell.mjs': "import 'dep/lourd.js'\nexport default {}\n",
      'node_modules/dep/package.json': '{ "name": "dep" }',
      'node_modules/dep/lourd.js': 'window.dep = 1;'.repeat(400),
    })

    expect(
      await pluginWeights(
        surfaces({ shell: [{ plugin: 'p', file: chemin('shell.mjs') }], plugins: ['p'] }),
      ),
    ).toEqual([{ plugin: 'p', bytes: gz(chemin('shell.mjs')) }])
  })

  test('weighs each plugin in its order, one with no browser surface at 0', async () => {
    const chemin = arbre({ 'a.mjs': 'export default 1\n', 'b.mjs': 'export default 22\n' })

    expect(
      await pluginWeights(
        surfaces({
          shell: [
            { plugin: 'b', file: chemin('b.mjs') },
            { plugin: 'a', file: chemin('a.mjs') },
          ],
          plugins: ['a', 'node', 'b'],
        }),
      ),
    ).toEqual([
      { plugin: 'a', bytes: gz(chemin('a.mjs')) },
      { plugin: 'node', bytes: 0 },
      { plugin: 'b', bytes: gz(chemin('b.mjs')) },
    ])
  })

  // Ce qui ne mène à aucun fichier, à un dossier ou à un fichier illisible, ce qui
  // ne se lit pas comme du JavaScript, et ce qui se rappelle soi-même : compté
  // sans lever, et sans tourner en rond. Une levée emportait la liste des panneaux.
  test('counts what it can read, and stops on what it cannot', async () => {
    const chemin = arbre({
      'preview.mjs':
        "import './a.mjs'\nimport './style.css'\nimport './absent.mjs'\nimport './dossier'\nimport './interdit.mjs'\nimport 'absent'\nimport 'node:fs'\nexport default {}\n",
      'a.mjs': "import './preview.mjs'\nexport const a = 1\n",
      'style.css': "@import './ailleurs.css';\nbody { color: red }\n",
      'interdit.mjs': 'export const i = 1\n',
    })
    mkdirSync(chemin('dossier'))
    chmodSync(chemin('interdit.mjs'), 0o000)

    expect(
      await pluginWeights(
        surfaces({ preview: [{ plugin: 'p', file: chemin('preview.mjs') }], plugins: ['p'] }),
      ),
    ).toEqual([
      { plugin: 'p', bytes: gz(chemin('preview.mjs'), chemin('a.mjs'), chemin('style.css')) },
    ])
  })

  // Un morceau chargé par `import()` ne part qu'à l'appel : il n'est pas compté.
  test('leaves out a chunk loaded by import()', async () => {
    const chemin = arbre({
      'preview.mjs': "export default { run: () => import('./tard.mjs') }\n",
      'tard.mjs': 'export const t = 1;'.repeat(400),
    })

    expect(
      await pluginWeights(
        surfaces({ preview: [{ plugin: 'p', file: chemin('preview.mjs') }], plugins: ['p'] }),
      ),
    ).toEqual([{ plugin: 'p', bytes: gz(chemin('preview.mjs')) }])
  })

  // Le shell redemande à chaque `ready` : un fichier réécrit depuis est relu.
  test('reads a file again once it changed', async () => {
    const chemin = arbre({ 'shell.mjs': 'export default 1\n' })
    const lire = () =>
      pluginWeights(
        surfaces({ shell: [{ plugin: 'p', file: chemin('shell.mjs') }], plugins: ['p'] }),
      )

    await lire()
    writeFileSync(chemin('shell.mjs'), "import './neuf.mjs'\nexport default 1\n")
    writeFileSync(chemin('neuf.mjs'), 'export const n = 1;'.repeat(400))
    // Même taille ou pas, une date qui bouge suffit : on la fixe loin devant.
    utimesSync(chemin('shell.mjs'), new Date(), new Date(Date.now() + 60_000))

    expect(await lire()).toEqual([
      { plugin: 'p', bytes: gz(chemin('shell.mjs'), chemin('neuf.mjs')) },
    ])
  })
})
