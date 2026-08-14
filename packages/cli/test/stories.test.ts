import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { entriesOf } from '../src/stories'

// La lecture d'un fichier de story, sans l'exécuter. Voir docs/contracts.md § 2.

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, 'fixture')
const stories = join(fixture, 'stories')

const temporary: string[] = []

afterAll(() => {
  for (const root of temporary) rmSync(root, { recursive: true, force: true })
})

// La fixture est un projet JavaScript. Les deux extensions TypeScript se
// mesurent donc ici, sur un projet jetable.
function fileWith(name: string, content: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-stories-')))
  const file = join(root, 'stories', name)

  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
  temporary.push(root)

  return entriesOf(file, root, join(root, 'stories'))
}

describe('la lecture des stories', () => {
  it('rend une seule story quand le fichier n’en nomme aucune', () => {
    const { entries, skipped } = entriesOf(join(stories, 'Badge.js'), fixture, stories)

    expect(skipped).toBeUndefined()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      type: 'story',
      id: 'badge--default',
      path: ['Badge'],
      name: 'Default',
      component: { name: 'Badge', file: '@/components/Badge', export: 'Badge' },
      storyFile: 'stories/Badge.js',
      props: [],
      source: '<Badge />',
    })
  })

  it('rend une entrée par story nommée, dans l’ordre du fichier', () => {
    const { entries } = entriesOf(join(stories, 'checkout', 'OrderSummary.jsx'), fixture, stories)

    expect(entries.map((entry) => entry.name)).toEqual([
      'Par défaut',
      'Avec référence',
      'Replié sur mobile',
    ])
    expect(entries.map((entry) => entry.id)).toEqual([
      'checkout/ordersummary--par-defaut',
      'checkout/ordersummary--avec-reference',
      'checkout/ordersummary--replie-sur-mobile',
    ])
  })

  it('donne le chemin par le dossier, et l’export par l’import', () => {
    const { entries } = entriesOf(join(stories, 'checkout', 'OrderSummary.jsx'), fixture, stories)

    expect(entries[0]).toMatchObject({
      path: ['checkout', 'OrderSummary'],
      component: {
        name: 'OrderSummary',
        file: '@/components/checkout/OrderSummary',
        export: 'default',
      },
      storyFile: 'stories/checkout/OrderSummary.jsx',
    })
  })

  // Sans la fusion, la couverture de props ne compterait que ce qu'une story
  // écrit elle-même, et le bloc commun ne serait exercé par personne.
  it('mêle les props communes et celles de la story', () => {
    const { entries } = entriesOf(join(stories, 'checkout', 'OrderSummary.jsx'), fixture, stories)

    expect(entries[0]?.props).toEqual(['benefits', 'title'])
    expect(entries[1]?.props).toEqual(['benefits', 'reference', 'title'])
    expect(entries[2]?.props).toEqual(['benefits', 'children', 'reference', 'title'])
  })

  it('reprend le texte de l’utilisateur dans le code d’appel', () => {
    const { entries } = entriesOf(join(stories, 'checkout', 'OrderSummary.jsx'), fixture, stories)

    expect(entries[1]?.source).toBe(
      '<OrderSummary title="Formule complète" benefits={[\'Historique complet\', \'Données vérifiées\']} reference="REF-4821-KD" />',
    )
    expect(entries[2]?.source).toContain('children={<span>Neuf</span>}')
  })

  it('lit les quatre extensions', () => {
    const short = "import { A } from '../a'\nexport default defineStories(A)\n"

    for (const name of ['A.ts', 'A.tsx', 'A.js', 'A.jsx']) {
      expect(fileWith(name, short).entries, name).toHaveLength(1)
    }
  })

  // Le TypeScript ne passe que si le parseur choisit sa langue sur l'extension.
  it('accepte la syntaxe TypeScript dans un .tsx', () => {
    const source = [
      "import { A } from '../a'",
      'const size = 4 as const',
      'export default defineStories(A, {',
      '  stories: { Grande: { size, label: <b>ok</b> } },',
      '})',
    ].join('\n')

    const { entries, skipped } = fileWith('A.tsx', source)

    expect(skipped).toBeUndefined()
    expect(entries[0]?.props).toEqual(['label', 'size'])
  })

  // Un fichier cassé ne doit pas coûter le catalogue entier.
  it('passe un fichier qu’il n’arrive pas à lire, sans échouer', () => {
    const { entries, skipped } = fileWith('A.ts', 'export default defineStories(A, {')

    expect(entries).toEqual([])
    expect(skipped).toBeTruthy()
  })

  it('passe un fichier sans export par défaut appelant defineStories', () => {
    const named = "import { A } from '../a'\nexport const stories = defineStories(A)\n"

    expect(fileWith('A.ts', named).skipped).toBe('no default export calling defineStories')
  })

  // Les noms d'un spread ne se lisent pas sans exécuter le fichier, et les
  // inventer mettrait de fausses props dans un chiffre de couverture.
  it('laisse de côté les props qu’un spread apporte', () => {
    const source = [
      "import { A } from '../a'",
      "import { base } from '../base'",
      'export default defineStories(A, {',
      '  stories: { Une: { ...base, label: 1 } },',
      '})',
    ].join('\n')

    expect(fileWith('A.ts', source).entries[0]?.props).toEqual(['label'])
  })

  it('refuse un composant qui n’est pas importé', () => {
    const source = 'export default defineStories(A)\n'

    expect(() => fileWith('A.ts', source)).toThrow(/without importing it/)
  })
})
