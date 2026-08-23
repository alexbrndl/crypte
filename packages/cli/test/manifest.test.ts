import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { buildCatalogue, OUTPUT, storiesOf, storyFiles, writeCatalogue } from '../src/manifest'
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

  // Le bandeau du shell ne montre que le certain, le terminal garde tout : deux
  // règles de forme se sont trompées avant celle-ci, chacune dans un sens, donc
  // ce qui reste une supposition ne va pas dans une interface permanente.
  it('ne met dans le manifeste que ce qui est certain', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'stories/A.ts': "import { A } from '../a'\nexport default defineStories(A)\n",
      // Une supposition : un composant enveloppé, idiomatique en React.
      'stories/Frame.tsx': "import { memo } from 'react'\nexport default memo(() => null)\n",
      // Une certitude : l'appel est là, mais pas en export par défaut.
      'stories/Nomme.ts': "import { A } from '../a'\nexport const stories = defineStories(A)\n",
    })

    const { manifest, skipped } = buildCatalogue(await loadProject(root))

    expect(skipped.map((one) => one.file)).toEqual(['stories/Frame.tsx', 'stories/Nomme.ts'])
    expect(manifest.skipped?.map((one) => one.file)).toEqual(['stories/Nomme.ts'])
  })

  // Supprimer une story est délibéré : un bandeau pour elle serait une ligne sur
  // laquelle personne ne peut agir.
  it('oublie un fichier qui a été supprimé', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'stories/A.ts': "import { A } from '../a'\nexport default defineStories(A)\n",
    })

    const avant = buildCatalogue(await loadProject(root))
    expect(avant.wasStory).toEqual(['stories/A.ts'])

    rmSync(join(root, 'stories', 'A.ts'))
    const après = buildCatalogue(await loadProject(root), avant)

    expect(après.manifest.skipped).toBeUndefined()
    expect(après.wasStory).toEqual([])
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

  // La section 4.2 promet un fichier, pas l'identifiant que la story écrit.
  it('résout le composant en chemin de projet', async () => {
    const { manifest } = buildCatalogue(await loadProject(fixture))

    expect(storiesOf(manifest).map((entry) => entry.component.file)).toEqual([
      'src/components/Badge.jsx',
      'src/components/checkout/OrderSummary.jsx',
      'src/components/checkout/OrderSummary.jsx',
      'src/components/checkout/OrderSummary.jsx',
    ])
  })

  it('résout aussi un import relatif', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'src/Card.jsx': 'export const Card = () => null\n',
      'stories/Card.js': "import { Card } from '../src/Card'\nexport default defineStories(Card)\n",
    })

    const { manifest } = buildCatalogue(await loadProject(root))

    expect(storiesOf(manifest)[0]?.component.file).toBe('src/Card.jsx')
  })

  // Rendre un chemin inventé serait pire que rendre l'identifiant : un écran
  // ouvrirait un fichier qui n'existe pas. `crypte check` dira l'orpheline.
  it('garde l’identifiant quand aucun fichier ne répond', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'stories/Card.js': "import { Card } from '../src/Card'\nexport default defineStories(Card)\n",
    })

    const { manifest } = buildCatalogue(await loadProject(root))

    expect(storiesOf(manifest)[0]?.component.file).toBe('../src/Card')
  })

  // La résolution tournait une fois par story, sur un objet de composant
  // partagé. Au second passage elle recevait son propre résultat, un chemin
  // relatif à la racine, qui est un identifiant « bare » et repassait par les
  // motifs : les deux entrées finissaient sur `lib/src/Card.jsx`.
  it('résout le composant une fois par fichier, pas une fois par story', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'jsconfig.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "*": ["./lib/*"] } } }',
      'src/Card.jsx': 'export const Card = () => null\n',
      'lib/src/Card.jsx': 'export const Card = () => null\n',
      'stories/Card.js': [
        "import { Card } from '../src/Card'",
        'export default defineStories(Card, {',
        '  stories: { Une: {}, Deux: {} },',
        '})',
      ].join('\n'),
    })

    const { manifest } = buildCatalogue(await loadProject(root))

    expect(storiesOf(manifest).map((entry) => entry.component.file)).toEqual([
      'src/Card.jsx',
      'src/Card.jsx',
    ])
  })

  // L'ordre des extensions doit être celui que vite@8.2.1 documente pour
  // `resolve.extensions`. Tout autre ordre fait résoudre un composant ici et un
  // autre dans la preview, sur un projet qui porte les deux fichiers.
  it('résout dans l’ordre d’extensions de Vite', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'src/Card.js': 'export const Card = () => null\n',
      'src/Card.ts': 'export const Card = () => null\n',
      'stories/Card.js': "import { Card } from '../src/Card'\nexport default defineStories(Card)\n",
    })

    const { manifest } = buildCatalogue(await loadProject(root))

    expect(storiesOf(manifest)[0]?.component.file).toBe('src/Card.js')
  })

  // Chaque fichier avant tout `index`, l'ordre de Node. L'extension du fichier
  // vient ici après celle de l'index dans la liste : sans ce cas, l'entrelacement
  // rendait la même réponse et la garantie ne tenait rien.
  it('préfère un fichier à un dossier portant un index', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'src/Card.ts': 'export const Card = () => null\n',
      'src/Card/index.js': 'export const Card = () => null\n',
      'stories/Card.js': "import { Card } from '../src/Card'\nexport default defineStories(Card)\n",
    })

    const { manifest } = buildCatalogue(await loadProject(root))

    expect(storiesOf(manifest)[0]?.component.file).toBe('src/Card.ts')
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
