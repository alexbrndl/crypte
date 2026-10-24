import { execFileSync } from 'node:child_process'
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
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { BUILD_OUTPUT, build, changesOf, dayBefore, pointFile } from '../src/commands/build'
import { staleOf } from '../src/commands/check'
import { FINGERPRINT, fingerprintOf } from '../src/catalogue/fingerprint'
import { healthOf } from '../src/catalogue/health'
import { buildCatalogue, storiesOf } from '../src/catalogue/manifest'
import { storybookIndexOf } from '../src/catalogue/storybook'
import { loadProject } from '../src/config/project'
import { ConfigError } from '../src/errors'

// `crypte build` sur une copie de la fixture, dans son propre dépôt : une branche
// `main` qui porte l'empreinte, un tag, puis une story éditée sans commit. Copiée
// sous `test/` et non dans `tmpdir()`, où `crypte.config.ts` ne résout plus
// `@crypte/cli`.

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixture')

const git = (root: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
    { cwd: root, stdio: 'ignore' },
  )

const lu = (root: string, ...path: string[]): unknown =>
  JSON.parse(readFileSync(join(root, BUILD_OUTPUT, ...path), 'utf8'))

const fichiers = (folder: string) =>
  readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((one) => one.isFile())
    .map((one) => join(one.parentPath, one.name))

// Sans JSX ni framework : la fixture importe React, que rien n'installe sous
// `test/`, et un build échoue sur ce qu'il ne résout pas.
const STORY = [
  "import { Badge } from '../src/Badge'",
  '',
  "export default defineStories(Badge, { stories: { 'Par défaut': { props: { label: 'Nouveau' } } } })",
  '',
].join('\n')

const temporaires: string[] = []

function projet(files: Record<string, string>): string {
  const root = mkdtempSync(join(fixture, '..', 'tmp-build-'))
  temporaires.push(root)
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), content)
  }
  return root
}

afterAll(() => {
  for (const root of temporaires) rmSync(root, { recursive: true, force: true })
})

describe('crypte build', () => {
  let root: string
  let plugin: string
  const lignes: string[] = []

  beforeAll(async () => {
    // Un module shell, son morceau, et ce que `crypte dev` ne servirait pas de
    // ses imports : un fichier absent, un dossier, un fichier caché, un fichier
    // au-dessus de son dossier. Ni copiés, ni cause d'échec.
    plugin = mkdtempSync(join(tmpdir(), 'crypte-build-plugin-'))
    mkdirSync(join(plugin, 'dist', 'parts'), { recursive: true })
    writeFileSync(
      join(plugin, 'dist', 'shell.mjs'),
      ['./parts/chunk.mjs', './absent.mjs', './parts', './.cache.mjs', '../outside.mjs']
        .map((one) => `import '${one}'\n`)
        .join(''),
    )
    // Une boucle : le morceau réimporte le module, copié une fois.
    writeFileSync(join(plugin, 'dist', 'parts', 'chunk.mjs'), "import '../shell.mjs'\nexport {}\n")
    writeFileSync(join(plugin, 'dist', '.cache.mjs'), 'export {}\n')
    writeFileSync(join(plugin, 'outside.mjs'), 'export {}\n')
    writeFileSync(join(plugin, 'dist', 'secret.txt'), 'hors du module\n')

    root = projet({
      'crypte.config.ts': [
        "import { defineConfig } from '@crypte/cli'",
        '',
        'export default defineConfig({',
        "  stories: 'stories',",
        "  adapter: { name: 'plain', mount() {}, unmount() {} },",
        `  plugins: [{ name: 'a', shell: ${JSON.stringify(pathToFileURL(join(plugin, 'dist', 'shell.mjs')).href)} }],`,
        '})',
        '',
      ].join('\n'),
      'src/Badge.js': 'export function Badge({ label, tone }) { return [label, tone].join(" ") }\n',
      'stories/Badge.js': STORY,
    })

    git(root, 'init', '-q', '-b', 'main')
    git(root, 'remote', 'add', 'origin', 'https://github.com/acme/ui.git')
    await build(root, () => {})
    git(root, 'add', '-A')
    git(root, 'commit', '-qm', 'catalogue')
    git(root, 'tag', 'v1')

    // Une prop de plus : l'écart ne liste que les props et le statut.
    writeFileSync(
      join(root, 'stories', 'Badge.js'),
      STORY.replace("{ label: 'Nouveau' }", "{ label: 'Nouveau', tone: 'vif' }"),
    )
    // Un reste d'un build d'avant, qu'un nouveau build ne garde pas.
    writeFileSync(join(root, BUILD_OUTPUT, 'reste.txt'), 'vieux')

    await build(root, (line) => lignes.push(line))
  }, 60_000)

  afterAll(() => {
    rmSync(plugin, { recursive: true, force: true })
  })

  test('writes the shell, the preview and the data its routes serve', async () => {
    const out = join(root, BUILD_OUTPUT)
    const project = await loadProject(root)

    expect(fichiers(out).length).toBeGreaterThan(5)
    for (const one of ['index.html', 'preview.html', 'iframe.html', 'vendor/vue.js'])
      expect(existsSync(join(out, one)), one).toBe(true)
    expect(existsSync(join(out, 'reste.txt'))).toBe(false)
    expect(lu(root, '@crypte', 'manifest.json')).toEqual(buildCatalogue(project).manifest)
    expect(lu(root, 'index.json')).toEqual(storybookIndexOf(buildCatalogue(project).manifest))
    expect(lu(root, '@crypte', 'versions.json')).toEqual({
      branch: 'main',
      tags: [{ name: 'v1', date: expect.any(String) }],
    })
    expect(lu(root, '@crypte', 'health.json')).toEqual(
      healthOf(project, storiesOf(buildCatalogue(project).manifest)),
    )
    expect(lignes).toEqual(['1 stories, written to crypte-static'])
  })

  test('dates the build and says no configuration failed', () => {
    const project = lu(root, '@crypte', 'project.json') as { built: string; config: unknown }

    expect(project.config).toBeNull()
    // Où le shell lit les points que le build n'a pas calculés.
    expect(project).toMatchObject({
      github: {
        repository: 'acme/ui',
        path: '',
        commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      },
    })
    expect(new Date(project.built).toISOString()).toBe(project.built)
  })

  // Relatif, et seulement ce que le module importe : le dossier d'un plugin
  // local peut être le projet entier.
  test('copies each shell module and its relative imports under a relative URL', () => {
    const plugins = lu(root, '@crypte', 'plugins.json') as { panels: unknown[] }
    const copied = join(root, BUILD_OUTPUT, '@crypte', 'plugins', '@a')

    expect(plugins.panels).toEqual([{ name: 'a', shell: '@crypte/plugins/@a/shell.mjs' }])
    expect(fichiers(copied).sort()).toEqual([
      join(copied, 'parts', 'chunk.mjs'),
      join(copied, 'shell.mjs'),
    ])
  })

  test('writes the fingerprint `crypte check` compares', async () => {
    const project = await loadProject(root)
    const { manifest } = buildCatalogue(project)

    expect(JSON.parse(readFileSync(join(root, FINGERPRINT), 'utf8'))).toEqual(
      fingerprintOf(manifest),
    )
    expect(staleOf(project, manifest)).toEqual([])
    // Publiée aussi, pour qu'un point lu sur GitHub se compare à elle.
    expect(lu(root, '@crypte', 'fingerprint.json')).toEqual(fingerprintOf(manifest))
  })

  // Le dossier est publié : le chemin où le build a tourné n'y entre pas.
  test('publishes nothing of the folder it ran in', () => {
    const out = join(root, BUILD_OUTPUT)
    const files = fichiers(out)

    expect(files.length).toBeGreaterThan(5)
    expect(files.filter((one) => readFileSync(one, 'utf8').includes(root))).toEqual([])
  })

  test('compares with the default branch, and writes one file per point offered', () => {
    const changes = join(root, BUILD_OUTPUT, '@crypte', 'changes')
    const built = new Date((lu(root, '@crypte', 'project.json') as { built: string }).built)
    const keys = [
      'ref:main',
      'ref:v1',
      `before:${dayBefore(built, 7)}`,
      `before:${dayBefore(built, 30)}`,
    ]

    expect(lu(root, '@crypte', 'changes.json')).toEqual({
      from: { ref: 'main', commit: expect.any(String) },
      changes: [
        { kind: 'changed', id: expect.stringMatching(/^badge--/), props: expect.anything() },
      ],
      tokens: [],
    })
    expect(readdirSync(changes).sort()).toEqual(keys.map(pointFile).sort())
    expect(lu(root, '@crypte', 'changes', pointFile('ref:v1'))).toMatchObject({
      from: { ref: 'v1' },
    })
  })
})

describe('the points of a build', () => {
  // Hors de tout dépôt : `tmpdir()`.
  test('says why there is no default comparison when Git names no branch', () => {
    const root = mkdtempSync(join(tmpdir(), 'crypte-points-'))
    try {
      const [first, ...rest] = changesOf(
        root,
        { version: 1, entries: [] } as never,
        { branch: null, tags: [] },
        new Date('2026-10-24T12:00:00Z'),
      )

      expect(first).toEqual([
        '/@crypte/changes.json',
        { reason: 'Git names no default branch to compare this build with' },
      ])
      expect(rest.map(([route]) => route)).toEqual([
        `/@crypte/changes/${pointFile('before:2026-10-17')}`,
        `/@crypte/changes/${pointFile('before:2026-09-24')}`,
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // Le jour UTC, celui que le shell relit : à 0 h 30 à Paris, on est encore la veille.
  test('counts the days before the build in UTC', () => {
    expect(dayBefore(new Date('2026-10-24T00:30:00+02:00'), 7)).toBe('2026-10-16')
  })

  // Les mêmes paires que `app.test.ts` éprouve côté shell : les deux côtés
  // nomment le fichier d'un point, et rien d'autre ne les tient ensemble.
  test.for([
    ['ref:release/1.0', '7265663a72656c656173652f312e30'],
    ['ref:été', '7265663ac3a974c3a9'],
    ['before:2026-10-17', '6265666f72653a323032362d31302d3137'],
  ] as const)('names %s by its key in hexadecimal', ([key, hex]) => {
    expect(pointFile(key)).toBe(`${hex}.json`)
  })
})

describe('what the build refuses', () => {
  // La feuille de la fixture importe un paquet absent : `crypte dev` ne le dirait
  // qu'à l'écran, le build le dit sans la pile de Vite.
  test('a preview that does not compile, as a configuration error', async () => {
    const root = mkdtempSync(join(fixture, '..', 'tmp-build-'))
    try {
      cpSync(fixture, root, { recursive: true })

      const said = await build(root, () => {}).catch((error: unknown) => error)
      expect(said).toBeInstanceOf(ConfigError)
      expect((said as Error).message.replaceAll(root, '<root>').split('\n').slice(0, 4))
        .toMatchInlineSnapshot(`
        [
          "The preview could not be built: Build failed with 1 error:",
          "",
          "[plugin vite:css] <root>/src/styles/app.css:undefined:NaN",
          "Error: [postcss] ENOENT: no such file or directory, open 'tailwindcss'",
        ]
      `)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('a configuration that cannot be read, before writing anything', async () => {
    const root = mkdtempSync(join(fixture, '..', 'tmp-build-'))
    try {
      cpSync(fixture, root, { recursive: true })
      writeFileSync(join(root, 'crypte.config.ts'), 'export default {}\n')

      await expect(build(root, () => {})).rejects.toBeInstanceOf(ConfigError)
      expect(existsSync(join(root, BUILD_OUTPUT))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
