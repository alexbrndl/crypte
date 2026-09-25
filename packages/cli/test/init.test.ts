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

describe('what the project says about itself', () => {
  // Un package.json qui ne déclare aucune dépendance : les deux champs sont
  // absents, pas vides, et la lecture les traversait sans les avoir éprouvés.
  test('refuses a project whose package.json declares nothing', () => {
    const root = projectWith({ 'package.json': JSON.stringify({ name: 'projet' }) })

    expect(() => planFor(root)).toThrow('No framework recognised')
  })

  test('refuses a project without package.json', () => {
    expect(() => planFor(projectWith({}))).toThrow('No framework recognised')
  })

  // Sans ce cas, un package.json illisible passerait pour un projet sans
  // cadriciel, et le message accuserait le mauvais fichier.
  test('names package.json when it cannot be read', () => {
    const root = projectWith({ 'package.json': '{ ceci ne se lit pas' })

    expect(() => planFor(root)).toThrow('package.json could not be read')
  })

  test.for([
    [['stories'], 'stories', false],
    [['src/stories'], 'src/stories', false],
    [['stories', 'src/stories'], 'stories', false],
    [[], 'stories', true],
  ] as const)('suggests %s as root', ([dossiers, attendu, manquante]) => {
    const root = projectWith({ 'package.json': paquet({ react: '^19.0.0' }) }, [...dossiers])
    const plan = planFor(root)

    expect(plan.stories).toBe(attendu)
    expect(plan.missing).toBe(manquante)
  })
})

describe('the written file', () => {
  test('holds the two required keys of section 1.5, and nothing else', () => {
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

describe('what the command prints', () => {
  // Les deux formes d'import : copié avec la mauvaise, l'exemple échoue au rendu
  // sur « does not provide an export named ». Et le chemin part de la racine des
  // stories, qui peut être sous `src`. DCJ-316.
  function exemple(racine: string): string {
    const root = projectWith({ 'package.json': paquet({ react: '^19.0.0' }) }, [racine])
    const lines = linesOf(planFor(root))
    const start = lines.findIndex((line) => line.startsWith('Write a first story'))

    expect(start).toBeGreaterThan(-1)
    return lines.slice(start).join('\n')
  }

  test('gives an example story for both export forms', () => {
    expect(exemple('stories')).toMatchInlineSnapshot(`
      "Write a first story under \`stories\`, then run \`crypte dev\`:

        // stories/Badge.ts
        import { defineStories } from '@crypte/react'
        import { Badge } from '../src/components/Badge'
        // or, for a component exported by default:
        // import Badge from '../src/components/Badge'

        export default defineStories(Badge)"
    `)
  })

  test('points the example at the components from a root under src', () => {
    expect(exemple('src/stories')).toMatchInlineSnapshot(`
      "Write a first story under \`src/stories\`, then run \`crypte dev\`:

        // src/stories/Badge.ts
        import { defineStories } from '@crypte/react'
        import { Badge } from '../components/Badge'
        // or, for a component exported by default:
        // import Badge from '../components/Badge'

        export default defineStories(Badge)"
    `)
  })

  test('gives the install command when the adapter is missing', () => {
    const root = projectWith({ 'package.json': paquet({ react: '^19.0.0' }) }, ['stories'])

    expect(linesOf(planFor(root)).join('\n')).toContain('npm i -D @crypte/cli @crypte/react')
  })

  test('does not give it when the adapter is there', () => {
    const root = projectWith(
      {
        'package.json': paquet({ react: '^19.0.0' }, { '@crypte/react': '^0.0.0' }),
      },
      ['stories'],
    )

    expect(linesOf(planFor(root)).join('\n')).not.toContain('npm i -D')
  })
})

describe('the command', () => {
  // Une configuration existante porte des réponses que cette commande ne sait
  // pas reconstruire, les plugins Vite d'abord.
  test('never overwrites an existing config', () => {
    const root = projectWith({
      'package.json': paquet({ react: '^19.0.0' }),
      'crypte.config.ts': '// la mienne',
    })

    expect(() => init(root, () => {})).toThrow('already there')
    expect(readFileSync(join(root, 'crypte.config.ts'), 'utf8')).toBe('// la mienne')
  })

  // `buildCatalogue` refuse une racine qui n'existe pas : sans la créer, la
  // configuration écrite ne démarrerait pas.
  test('creates the stories root when it is missing', () => {
    const root = projectWith({ 'package.json': paquet({ react: '^19.0.0' }) })

    init(root, () => {})

    expect(existsSync(join(root, 'stories'))).toBe(true)
  })

  test('writes nothing when no framework is recognised', () => {
    const root = projectWith({ 'package.json': paquet({ vue: '^3.5.0' }) })

    expect(() => init(root, () => {})).toThrow()
    expect(existsSync(join(root, 'crypte.config.ts'))).toBe(false)
  })
})

// Le critère de fin de `DCJ-175` : la configuration écrite doit être
// fonctionnelle. Sur une copie de la démonstration, donc avec les vrais paquets
// résolus, et éprouvée par le chargeur réel puis par le catalogue.
describe('the generated config', () => {
  test('loads and yields a catalogue', { timeout: 60_000 }, async () => {
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
