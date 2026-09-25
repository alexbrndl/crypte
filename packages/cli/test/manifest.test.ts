import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Manifest } from '@crypte/core/protocol'
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

describe('the catalogue', () => {
  it('picks up only the four extensions', () => {
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
  it('puts only what is certain in the manifest', async () => {
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
  it('forgets a file that was deleted', async () => {
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

  it('reports an unreadable file without losing the others', async () => {
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
  it('refuses two stories that land on the same id', async () => {
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

  it('names the stories folder when it is missing', async () => {
    const root = projectWith({ 'crypte.config.ts': CONFIG })

    await expect(async () => buildCatalogue(await loadProject(root))).rejects.toThrow(
      /`stories` does not exist/,
    )
  })

  // La résolution tournait une fois par story, sur un objet de composant
  // partagé. Au second passage elle recevait son propre résultat, un chemin
  // relatif à la racine, qui est un identifiant « bare » et repassait par les
  // motifs : les deux entrées finissaient sur `lib/src/Card.jsx`.
  it('resolves the component once per file, not once per story', async () => {
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
  it('resolves in Vite’s extension order', async () => {
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
  it('prefers a file over a folder holding an index', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'src/Card.ts': 'export const Card = () => null\n',
      'src/Card/index.js': 'export const Card = () => null\n',
      'stories/Card.js': "import { Card } from '../src/Card'\nexport default defineStories(Card)\n",
    })

    const { manifest } = buildCatalogue(await loadProject(root))

    expect(storiesOf(manifest)[0]?.component.file).toBe('src/Card.ts')
  })

  it('writes JSON that reads back unchanged', async () => {
    const project = await loadProject(fixture)
    const root = projectWith({})
    const { manifest } = buildCatalogue(project)

    const file = writeCatalogue(root, manifest)

    expect(file).toBe(join(root, OUTPUT))
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(manifest)
  })
})

// Ce que l'entrée dit quand l'inférence n'a rien lu du composant, section 4.2.
// Tous les cas de lecture sont dans `props.test.ts` ; ici, ce que l'entrée en
// porte, et le composant introuvable, qui ne passe pas par la lecture.
describe('props that could not be read', () => {
  const unreadOf = async (component: Record<string, string>, imported: string) => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      ...component,
      'stories/Card.ts': `import { Card } from '${imported}'\nexport default defineStories(Card, {})\n`,
    })
    const [entry] = storiesOf(buildCatalogue(await loadProject(root)).manifest)

    return entry ? { details: entry.details, propsUnread: entry.propsUnread } : undefined
  }

  it('carries the reason the reader gave', async () => {
    expect(
      await unreadOf(
        { 'src/Card.tsx': 'export function Card(props) { return null }\n' },
        '../src/Card',
      ),
    ).toEqual({ details: {}, propsUnread: 'its props type is not one the reader follows' })
  })

  // Un composant d'un paquet garde le spécificateur écrit par la story, qui ne
  // nomme aucun fichier du projet.
  it('names a component whose file cannot be found', async () => {
    expect(await unreadOf({}, '@acme/ui')).toEqual({
      details: {},
      propsUnread: 'its file could not be found',
    })
  })

  // L'autre côté de la paire : un composant sans props, lu, n'en porte pas.
  it('carries nothing for a component with no props', async () => {
    expect(
      await unreadOf({ 'src/Card.tsx': 'export function Card() { return null }\n' }, '../src/Card'),
    ).toEqual({ details: {}, propsUnread: undefined })
  })
})

// La règle de fusion de la section 3.2 : `details` **complète** l'inférence, par
// prop et champ par champ. Elle était écrite sans qu'aucun cas ne la garde.
describe('details, inference completed by the file', () => {
  const component = `export interface P {
  /** Lue du composant. */
  label: string
  tone?: 'a' | 'b'
}
export function Card({ label, tone }: P) { return null }
`

  const story = (details: string) =>
    `import { Card } from '../src/Card'\nexport default defineStories(Card, ${details})\n`

  const detailsOn = async (declared: string) => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'src/Card.tsx': component,
      'stories/Card.ts': story(declared),
    })
    const { manifest } = buildCatalogue(await loadProject(root))
    const entry = manifest.entries[0]

    return entry?.type === 'story' ? entry.details : undefined
  }

  it('returns inference alone when the file declares nothing', async () => {
    expect(await detailsOn('{}')).toEqual({
      label: { type: 'string', required: true, description: 'Lue du composant.' },
      tone: { type: 'enum', required: false, options: ['a', 'b'] },
    })
  })

  // Un champ explicite remplace **lui seul**. Le type, la description et le
  // caractère requis viennent toujours de l'inférence.
  it('replaces the written field and keeps the others', async () => {
    expect(await detailsOn("{ details: { label: { description: 'écrite à la main' } } }")).toEqual({
      label: { type: 'string', required: true, description: 'écrite à la main' },
      tone: { type: 'enum', required: false, options: ['a', 'b'] },
    })
  })

  it('adds a field inference does not know', async () => {
    const details = await detailsOn('{ details: { tone: { min: 0 } } }')

    expect(details?.tone).toEqual({ type: 'enum', required: false, options: ['a', 'b'], min: 0 })
  })

  // Une prop que le fichier nomme et que l'inférence n'a pas vue : l'auteur
  // documente ce que le lecteur ne pouvait pas voir, et la perdre perdrait le
  // seul mot écrit à son sujet.
  it('keeps a prop inference did not find', async () => {
    const details = await detailsOn("{ details: { hidden: { description: 'via un spread' } } }")

    expect(details?.hidden).toEqual({
      type: 'unknown',
      required: false,
      description: 'via un spread',
    })
  })

  it('ignores a details entry that is not an object', async () => {
    const details = await detailsOn("{ details: { label: 'pas un objet' } }")

    expect(details?.label).toEqual({
      type: 'string',
      required: true,
      description: 'Lue du composant.',
    })
  })
})

// Le manifeste de la fixture, en entier, écrit à la main. Les autres cas
// vérifient un champ à la fois ; celui-ci fige la forme, donc un champ qui
// apparaît, disparaît ou change de nom se voit ici et nulle part ailleurs.
const EXPECTED: Manifest = {
  version: 1,
  entries: [
    {
      type: 'story',
      id: 'badge--default',
      path: ['Badge'],
      name: 'Default',
      component: { name: 'Badge', file: 'src/components/Badge.jsx', export: 'Badge' },
      storyFile: 'stories/Badge.js',
      options: {},
      details: {},
      props: [],
      source: '<Badge />',
    },
    {
      type: 'story',
      id: 'checkout/ordersummary--par-defaut',
      path: ['checkout', 'OrderSummary'],
      name: 'Par défaut',
      component: {
        name: 'OrderSummary',
        file: 'src/components/checkout/OrderSummary.jsx',
        export: 'default',
      },
      storyFile: 'stories/checkout/OrderSummary.jsx',
      options: {},
      details: {},
      props: ['benefits', 'title'],
      meta: { status: 'stable', owner: 'checkout' },
      source:
        "<OrderSummary title=\"Formule complète\" benefits={['Historique complet', 'Données vérifiées']} />",
    },
    {
      type: 'story',
      id: 'checkout/ordersummary--avec-reference',
      path: ['checkout', 'OrderSummary'],
      name: 'Avec référence',
      component: {
        name: 'OrderSummary',
        file: 'src/components/checkout/OrderSummary.jsx',
        export: 'default',
      },
      storyFile: 'stories/checkout/OrderSummary.jsx',
      options: {},
      details: {},
      props: ['benefits', 'reference', 'title'],
      meta: { status: 'stable', owner: 'checkout' },
      source:
        '<OrderSummary title="Formule complète" benefits={[\'Historique complet\', \'Données vérifiées\']} reference="REF-4821-KD" />',
    },
    {
      type: 'story',
      id: 'checkout/ordersummary--replie-sur-mobile',
      path: ['checkout', 'OrderSummary'],
      name: 'Replié sur mobile',
      component: {
        name: 'OrderSummary',
        file: 'src/components/checkout/OrderSummary.jsx',
        export: 'default',
      },
      storyFile: 'stories/checkout/OrderSummary.jsx',
      options: { responsive: 'mobile' },
      details: {},
      props: ['benefits', 'children', 'reference', 'title'],
      meta: { status: 'stable', owner: 'checkout' },
      source:
        '<OrderSummary title="Formule complète" benefits={[\'Historique complet\', \'Données vérifiées\']} reference="REF-4821"><span>Neuf</span></OrderSummary>',
    },
  ],
}

describe('the manifest shape', () => {
  it('is the one the fixture produces, field by field', async () => {
    const { manifest } = buildCatalogue(await loadProject(fixture))

    expect(manifest).toEqual(EXPECTED)
  })
})
