import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, test } from 'vitest'
import { configFor, init, linesOf, planFor } from '../src/init'
import { buildCatalogue } from '../src/manifest'
import { loadProject } from '../src/project'

// `crypte init` s'installe dans un projet qui existe déjà : il lit ce que le
// projet déclare, et refuse plutôt que d'écrire une configuration que
// `crypte dev` rejetterait ensuite.

const demo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'demo')

const temporary: string[] = []

afterAll(() => {
  for (const root of temporary) rmSync(root, { recursive: true, force: true })
})

function projectWith(files: Record<string, string>, dossiers: string[] = []): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-init-')))

  for (const [name, content] of Object.entries(files)) {
    const file = join(root, name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }

  for (const dossier of dossiers) mkdirSync(join(root, dossier), { recursive: true })

  temporary.push(root)

  return root
}

const paquet = (deps: Record<string, string>, dev: Record<string, string> = {}) =>
  JSON.stringify({ name: 'projet', dependencies: deps, devDependencies: dev })

describe('ce que le projet dit de lui-même', () => {
  // Un package.json qui ne déclare aucune dépendance : les deux champs sont
  // absents, pas vides, et la lecture les traversait sans les avoir éprouvés.
  test('refuse un projet dont le package.json ne déclare rien', () => {
    const root = projectWith({ 'package.json': JSON.stringify({ name: 'projet' }) })

    expect(() => planFor(root)).toThrow('No framework recognised')
  })

  test('refuse un projet sans package.json', () => {
    expect(() => planFor(projectWith({}))).toThrow('No framework recognised')
  })

  // Sans ce cas, un package.json illisible passerait pour un projet sans
  // cadriciel, et le message accuserait le mauvais fichier.
  test('nomme le package.json quand il ne se lit pas', () => {
    const root = projectWith({ 'package.json': '{ ceci ne se lit pas' })

    expect(() => planFor(root)).toThrow('package.json could not be read')
  })

  test.for([
    [['stories'], 'stories', false],
    [['src/stories'], 'src/stories', false],
    [['stories', 'src/stories'], 'stories', false],
    [[], 'stories', true],
  ] as const)('propose %s comme racine', ([dossiers, attendu, manquante]) => {
    const root = projectWith({ 'package.json': paquet({ react: '^19.0.0' }) }, [...dossiers])
    const plan = planFor(root)

    expect(plan.stories).toBe(attendu)
    expect(plan.missing).toBe(manquante)
  })
})

describe('le fichier écrit', () => {
  test('porte les deux clés requises de la section 1.5, et rien d’autre', () => {
    const root = projectWith({ 'package.json': paquet({ react: '^19.0.0' }) }, ['stories'])

    expect(configFor(planFor(root))).toMatchInlineSnapshot(`
      "import { defineConfig } from '@crypte/cli'
      import react from '@crypte/react'

      export default defineConfig({
        stories: 'stories',
        adapter: react(),
      })
      "
    `)
  })
})

describe('ce que la commande imprime', () => {
  test('donne la commande d’installation quand l’adaptateur manque', () => {
    const root = projectWith({ 'package.json': paquet({ react: '^19.0.0' }) }, ['stories'])

    expect(linesOf(planFor(root)).join('\n')).toContain('npm i -D @crypte/cli @crypte/react')
  })

  test('ne la donne pas quand il est là', () => {
    const root = projectWith(
      {
        'package.json': paquet({ react: '^19.0.0' }, { '@crypte/react': '^0.0.0' }),
      },
      ['stories'],
    )

    expect(linesOf(planFor(root)).join('\n')).not.toContain('npm i -D')
  })
})

describe('la commande', () => {
  // Une configuration existante porte des réponses que cette commande ne sait
  // pas reconstruire, les plugins Vite d'abord.
  test('n’écrase jamais une configuration existante', () => {
    const root = projectWith({
      'package.json': paquet({ react: '^19.0.0' }),
      'crypte.config.ts': '// la mienne',
    })

    expect(() => init(root, () => {})).toThrow('already there')
    expect(readFileSync(join(root, 'crypte.config.ts'), 'utf8')).toBe('// la mienne')
  })

  // `buildCatalogue` refuse une racine qui n'existe pas : sans la créer, la
  // configuration écrite ne démarrerait pas.
  test('crée la racine de stories quand elle manque', () => {
    const root = projectWith({ 'package.json': paquet({ react: '^19.0.0' }) })

    init(root, () => {})

    expect(existsSync(join(root, 'stories'))).toBe(true)
  })

  test('n’écrit rien quand aucun cadriciel n’est reconnu', () => {
    const root = projectWith({ 'package.json': paquet({ vue: '^3.5.0' }) })

    expect(() => init(root, () => {})).toThrow()
    expect(existsSync(join(root, 'crypte.config.ts'))).toBe(false)
  })
})

// Le critère de fin de `DCJ-175` : la configuration écrite doit être
// fonctionnelle. Sur une copie de la démonstration, donc avec les vrais paquets
// résolus, et éprouvée par le chargeur réel puis par le catalogue.
describe('la configuration produite', () => {
  test('se charge et donne un catalogue', { timeout: 60_000 }, async () => {
    const root = mkdtempSync(join(demo, '..', 'tmp-demo-'))
    temporary.push(root)
    cpSync(demo, root, { recursive: true })
    rmSync(join(root, 'crypte.config.ts'))

    init(root, () => {})

    const project = await loadProject(root)

    expect(project.config.stories).toBe('stories')
    expect(project.config.adapter).not.toBeNull()
    expect(buildCatalogue(project).manifest.entries.length).toBeGreaterThan(0)
  })
})
