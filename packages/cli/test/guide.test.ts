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
  const after = guide.slice(guide.indexOf(marker) + marker.length)
  const found = after.match(/```(\w+)\n([\s\S]*?)```/)

  expect(found, `aucun bloc de code après « ${marker} »`).not.toBeNull()

  return { language: found?.[1] ?? '', code: found?.[2] ?? '' }
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

  it('la configuration est acceptée par le CLI', async () => {
    const { language, code } = example('config')
    expect(language).toBe('ts')

    // Les deux imports du guide désignent des paquets qu'un projet installe, et
    // le chargeur les résoudrait vraiment. On garde la forme de l'objet, qui est
    // ce que le guide décrit, et l'adaptateur devient une valeur quelconque.
    const source = code
      .replace(/^import .*\n/gm, '')
      .replace('adapter: react(),', 'adapter: { name: "react" },')
      .replace('export default defineConfig(', 'export default (')

    const root = projectWith({
      'crypte.config.ts': source,
      'src/styles/app.css': '',
    })
    const project = await loadProject(root)

    expect(project.config.stories).toBe('stories')
    expect(project.config.adapter).toEqual({ name: 'react' })
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
