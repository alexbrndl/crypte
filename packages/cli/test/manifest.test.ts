import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { buildCatalogue, OUTPUT, storyFiles, writeCatalogue } from '../src/manifest'
import { loadProject } from '../src/project'

// Le catalogue écrit à partir du dossier de stories. Voir docs/contracts.md § 4.

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, 'fixture')

const temporary: string[] = []

afterAll(() => {
  for (const root of temporary) rmSync(root, { recursive: true, force: true })
})

function projectWith(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-manifest-')))

  for (const [name, content] of Object.entries(files)) {
    const file = join(root, name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }

  temporary.push(root)

  return root
}

const CONFIG = "export default { stories: 'stories', adapter: { name: 'react' } }\n"

describe('le catalogue', () => {
  it('rassemble les stories de la fixture', async () => {
    const { manifest, skipped } = buildCatalogue(await loadProject(fixture))

    expect(skipped).toEqual([])
    expect(manifest.version).toBe(1)
    expect(manifest.entries.map((entry) => entry.id)).toEqual([
      'badge--default',
      'checkout/ordersummary--par-defaut',
      'checkout/ordersummary--avec-reference',
      'checkout/ordersummary--replie-sur-mobile',
    ])
  })

  // Sans tri, deux machines écrivent deux fichiers différents pour le même
  // dossier, et l'empreinte du lot 4 ter change sans raison.
  it('parcourt le dossier dans un ordre stable', () => {
    const root = projectWith({
      'stories/b.ts': '',
      'stories/a.ts': '',
      'stories/sub/c.ts': '',
      'stories/sub/a.ts': '',
    })

    expect(storyFiles(join(root, 'stories')).map((file) => file.slice(root.length + 9))).toEqual([
      'a.ts',
      'b.ts',
      join('sub', 'a.ts'),
      join('sub', 'c.ts'),
    ])
  })

  it('ne ramasse que les quatre extensions', () => {
    const root = projectWith({
      'stories/A.ts': '',
      'stories/A.tsx': '',
      'stories/A.js': '',
      'stories/A.jsx': '',
      'stories/README.md': '',
      'stories/A.css': '',
      'stories/node_modules/B.ts': '',
    })

    expect(storyFiles(join(root, 'stories')).map((file) => file.slice(root.length + 9))).toEqual([
      'A.js',
      'A.jsx',
      'A.ts',
      'A.tsx',
    ])
  })

  it('signale un fichier illisible sans perdre les autres', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'stories/A.ts': "import { A } from '../a'\nexport default defineStories(A)\n",
      'stories/B.ts': 'export default defineStories(',
    })

    const { manifest, skipped } = buildCatalogue(await loadProject(root))

    expect(manifest.entries.map((entry) => entry.id)).toEqual(['a--default'])
    expect(skipped).toHaveLength(1)
    expect(skipped[0]?.file).toBe('stories/B.ts')
  })

  // L'identifiant est une URL, une clé de baseline et l'ancre d'un commentaire.
  // Une collision doit être nommée, pas tranchée en silence.
  it('refuse deux stories qui tombent sur le même identifiant', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'stories/A.ts': [
        "import { A } from '../a'",
        'export default defineStories(A, {',
        "  stories: { 'Avec référence': {}, 'avec reference': {} },",
        '})',
      ].join('\n'),
    })

    const project = await loadProject(root)

    expect(() => buildCatalogue(project)).toThrow(/a--avec-reference/)
  })

  it('nomme le dossier de stories quand il manque', async () => {
    const root = projectWith({ 'crypte.config.ts': CONFIG })

    await expect(async () => buildCatalogue(await loadProject(root))).rejects.toThrow(
      /`stories` does not exist/,
    )
  })

  it('écrit un JSON relu tel quel', async () => {
    const project = await loadProject(fixture)
    const root = projectWith({})
    const { manifest } = buildCatalogue(project)

    const file = writeCatalogue(root, manifest)

    expect(file).toBe(join(root, OUTPUT))
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(manifest)
  })
})
