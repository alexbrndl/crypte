import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { projectPathsOf } from '../src/config-paths'
import { loadProject } from '../src/project'

// Les exemples du guide, exécutés. Un exemple faux vaut moins que pas d'exemple :
// il apprend à ne plus les lire. Voir docs/internal/architecture.md.

const here = dirname(fileURLToPath(import.meta.url))
const guide = readFileSync(join(here, '..', '..', '..', 'docs', 'guide.md'), 'utf8')

const temporary: string[] = []

afterAll(() => {
  for (const root of temporary) rmSync(root, { recursive: true, force: true })
})

// Le bloc qui suit `<!-- checked: nom -->`, avec sa langue.
function example(name: string): { language: string; code: string } {
  const marker = `<!-- checked: ${name} -->`

  // Le marqueur d'abord : `indexOf` rend -1 sur un marqueur absent, et la
  // découpe qui suit ramenait alors le premier bloc du guide, langue comprise.
  expect(guide, `marqueur « ${marker} » absent du guide`).toContain(marker)

  const after = guide.slice(guide.indexOf(marker) + marker.length)
  const found = after.match(/```(\w+)\n([\s\S]*?)```/)

  expect(found, `aucun bloc de code après « ${marker} »`).not.toBeNull()

  return { language: found?.[1] ?? '', code: found?.[2] ?? '' }
}

// Ce qu'un paquet du dépôt exporte vraiment, lu à la source.
function exportsOf(pkg: string): string[] {
  const name = pkg.replace('@crypte/', '')
  const entry = name === 'cli' ? 'config.ts' : 'index.ts'
  const source = readFileSync(join(here, '..', '..', name, 'src', entry), 'utf8')

  return [...source.matchAll(/^export (?:type |interface |const |function )(\w+)/gm)].map(
    (match) => match[1] as string,
  )
}

// Si le paquet a un export par défaut : le guide en montre un depuis que
// l'adaptateur en a un, et un nom d'import par défaut ne dit rien de ce que le
// paquet exporte, donc c'est la seule chose vérifiable de ce côté.
function hasDefault(pkg: string): boolean {
  const name = pkg.replace('@crypte/', '')
  const entry = name === 'cli' ? 'config.ts' : 'index.ts'
  const source = readFileSync(join(here, '..', '..', name, 'src', entry), 'utf8')

  return /^export default /m.test(source)
}

function projectWith(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-guide-')))

  for (const [name, content] of Object.entries(files)) {
    const file = join(root, name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }

  temporary.push(root)

  return root
}

describe('les exemples du guide', () => {
  // Sans ce cas, renommer un marqueur ferait passer chaque exemple en silence :
  // `example` échouerait, mais plus personne ne lirait le guide.
  it('sont tous rattachés à un cas', () => {
    const markers = [...guide.matchAll(/<!-- checked: (\w+) -->/g)].map((m) => m[1])

    expect([...markers].sort()).toEqual(['aliases', 'config'])
  })

  // `indexOf` rend -1 sur un marqueur absent, et la découpe ramenait alors le
  // premier bloc du guide : l'extraction rendait le mauvais bloc en silence.
  it('refuse un marqueur qu’il ne trouve pas', () => {
    expect(() => example('inexistant')).toThrow(/marqueur/)
  })

  // Retirer les imports avant d'exécuter l'exemple laissait passer n'importe
  // quel nom : le guide a montré `react()` pendant tout un tour, que
  // `@crypte/react` n'exporte pas. Ce que le lecteur copie est vérifié ici.
  it('n’importe que des noms que les paquets exportent', () => {
    const { code } = example('config')
    const imports = [...code.matchAll(/^import \{([^}]+)\} from '([^']+)'/gm)]

    expect(imports.length, 'aucun import nommé dans l’exemple').toBe(1)

    for (const [, names = '', pkg = ''] of imports) {
      const exported = exportsOf(pkg)
      expect(exported.length, `aucun export lu dans ${pkg}`).toBeGreaterThan(0)

      for (const name of names.split(',').map((one) => one.trim())) {
        expect(exported, `${pkg} n’exporte pas ${name}`).toContain(name)
      }
    }
  })

  // Un import par défaut ne nomme rien du paquet, donc ce qui se vérifie est
  // qu'il y en ait un. Le guide a montré `react()` pendant tout un tour sans que
  // `@crypte/react` l'exporte, et c'est cette forme-là qu'il montre maintenant.
  it('n’importe par défaut que d’un paquet qui en a un', () => {
    const { code } = example('config')
    const défauts = [...code.matchAll(/^import \w+ from '([^']+)'/gm)]

    expect(défauts.length, 'aucun import par défaut dans l’exemple').toBe(1)

    for (const [, pkg = ''] of défauts) {
      expect(hasDefault(pkg), `${pkg} n’a pas d’export par défaut`).toBe(true)
    }
  })

  it('la configuration est acceptée par le CLI', async () => {
    const { language, code } = example('config')
    expect(language).toBe('ts')

    // Les imports désignent des paquets qu'un projet installe et que le dossier
    // temporaire n'a pas. Leurs noms sont vérifiés par le cas ci-dessus ; ici on
    // garde la forme de l'objet, qui est ce que le guide décrit.
    const source = code
      .replace(/^import .*\n/gm, '')
      .replace('adapter: react(),', 'adapter: { name: "react" },')
      .replace('export default defineConfig(', 'export default (')

    // Une substitution muette laisserait le fichier tel quel, donc `import`
    // resterait et l'erreur porterait sur le paquet, pas sur l'exemple.
    expect(source).not.toContain('import')
    expect(source).not.toContain('createAdapter')
    expect(source).not.toContain('defineConfig')

    const root = projectWith({
      'crypte.config.ts': source,
      'src/styles/app.css': '',
    })
    const project = await loadProject(root)

    expect(project.config.stories).toBe('stories')
    expect(project.config.css).toBe('src/styles/app.css')
  })

  it('le message cité est bien celui que le CLI produit', async () => {
    const quoted = guide.match(/```\n(crypte\.config\.ts must declare[^\n]*)\n```/)?.[1]
    expect(quoted, 'message absent du guide').toBeDefined()

    const root = projectWith({ 'crypte.config.ts': 'export default { adapter: {} }' })

    await expect(loadProject(root)).rejects.toThrow(quoted)
  })

  it('les alias sont lus tels que le guide les écrit', async () => {
    const { language, code } = example('aliases')
    expect(language).toBe('json')

    const root = projectWith({ 'jsconfig.json': code })
    const paths = await projectPathsOf(root)

    expect(paths?.paths).toEqual({ '@/*': ['src/*'] })
    expect(paths?.base).toBe(root)
  })
})
