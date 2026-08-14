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

  // Les entrées d'un fichier partageaient un seul objet `component`. Muter le
  // champ d'une entrée les mutait toutes, et la résolution recevait au second
  // passage son propre résultat.
  it('donne à chaque entrée son propre objet de composant', () => {
    const { entries } = entriesOf(join(stories, 'checkout', 'OrderSummary.jsx'), fixture, stories)

    expect(entries[0]?.component).not.toBe(entries[1]?.component)
    expect(entries[0]?.component).toEqual(entries[1]?.component)
  })

  // Section 4.4 : `meta` et `options` voyagent du fichier au manifeste sans
  // être interprétés. `details` attend l'adaptateur, lui.
  it('porte le meta du fichier sur chacune de ses stories', () => {
    const { entries } = entriesOf(join(stories, 'checkout', 'OrderSummary.jsx'), fixture, stories)

    for (const entry of entries) {
      expect(entry.meta).toEqual({ status: 'stable', owner: 'checkout' })
    }
  })

  it('ne pose pas de meta quand le fichier n’en déclare aucun', () => {
    const { entries } = entriesOf(join(stories, 'Badge.js'), fixture, stories)

    expect('meta' in (entries[0] ?? {})).toBe(false)
  })

  it('porte les options du second argument de story()', () => {
    const { entries } = entriesOf(join(stories, 'checkout', 'OrderSummary.jsx'), fixture, stories)

    expect(entries.map((entry) => entry.options)).toEqual([{}, {}, { responsive: 'mobile' }])
  })

  it('lit les valeurs que JSON sait porter', () => {
    const source = [
      "import { A } from '../a'",
      'export default defineStories(A, {',
      "  meta: { status: 'stable', count: -2, ok: true, nothing: null, tags: ['a', 'b'] },",
      '})',
    ].join('\n')

    expect(fileWith('A.ts', source).entries[0]?.meta).toEqual({
      status: 'stable',
      count: -2,
      ok: true,
      nothing: null,
      tags: ['a', 'b'],
    })
  })

  // `JSON.stringify` laisse tomber en silence ce qu'il ne sait pas représenter.
  // Écrire la clé quand même mettrait dans le manifeste une valeur qui
  // disparaît à l'écriture : section 4.5.
  it('laisse tomber un meta dont une valeur ne survit pas au JSON', () => {
    const cases = [
      'meta: { at: new Date() }',
      'meta: { on: () => null }',
      'meta: { owner: someName }',
      'meta: { pattern: /a/ }',
      'meta: { ...base }',
      'meta: { deep: { fn: () => null } }',
      "meta: { list: ['a', someName] }",
    ]

    for (const written of cases) {
      const source = [
        "import { A } from '../a'",
        "import { base, someName } from '../base'",
        `export default defineStories(A, { ${written} })`,
      ].join('\n')

      expect(fileWith('A.ts', source).entries[0]?.meta, written).toBeUndefined()
    }
  })

  // Une référence manquante était fatale, là où une erreur de syntaxe ne
  // l'était pas : l'asymétrie était l'inverse de celle qui est documentée.
  it('passe un fichier dont le composant n’est pas importé', () => {
    const { entries, skipped } = fileWith('A.ts', 'export default defineStories(A)\n')

    expect(entries).toEqual([])
    expect(skipped).toMatch(/not imported/)
  })

  // Un espace de noms ne nomme aucun export, donc `export: 'A'` désignerait un
  // export qui n'existe pas.
  it('passe un composant lié par un import d’espace de noms', () => {
    const source = "import * as A from '../a'\nexport default defineStories(A)\n"

    expect(fileWith('A.ts', source).skipped).toMatch(/not imported/)
  })

  it('garde le nom d’origine d’un composant renommé à l’import', () => {
    const source = "import { Origin as A } from '../a'\nexport default defineStories(A)\n"

    expect(fileWith('A.ts', source).entries[0]?.component).toEqual({
      name: 'A',
      file: '../a',
      export: 'Origin',
    })
  })

  // Un nom de story est une URL, une clé de baseline et l'ancre d'un
  // commentaire : prendre le nom de la variable donnerait les trois faux.
  it('laisse tomber une story dont la clé est calculée', () => {
    const source = [
      "import { A } from '../a'",
      'export default defineStories(A, {',
      '  stories: { [key]: { a: 1 }, Vraie: { b: 2 } },',
      '})',
    ].join('\n')

    const { entries, skipped } = fileWith('A.ts', source)

    expect(entries.map((entry) => entry.name)).toEqual(['Vraie'])
    expect(skipped).toMatch(/computed at runtime/)
  })

  // Le repli sur `Default` appartient au fichier qui ne nomme aucune story. Un
  // fichier dont les clés sont toutes illisibles en nomme, donc replier
  // inventait une entrée que l'auteur n'a jamais écrite, avec un identifiant
  // qui devient une URL et une clé de baseline.
  it('ne replie pas sur Default quand le fichier nomme des stories illisibles', () => {
    const source = [
      "import { A } from '../a'",
      'export default defineStories(A, {',
      '  props: { shared: 1 },',
      '  stories: { [key]: { a: 1 } },',
      '})',
    ].join('\n')

    const { entries, skipped } = fileWith('A.ts', source)

    expect(entries).toEqual([])
    expect(skipped).toMatch(/computed at runtime/)
  })

  it('replie sur Default quand le fichier ne déclare pas de bloc stories', () => {
    const source = [
      "import { A } from '../a'",
      'export default defineStories(A, { props: { shared: 1 } })',
    ].join('\n')

    const { entries, skipped } = fileWith('A.ts', source)

    expect(entries.map((entry) => entry.name)).toEqual(['Default'])
    expect(skipped).toBeUndefined()
  })

  // Le nom n'est pas inventé, ce qui est juste, mais la perte était muette :
  // l'auteur voyait un catalogue amputé et aucun message.
  it('signale les stories qu’un spread emporte', () => {
    const source = [
      "import { A } from '../a'",
      "import { common } from '../common'",
      'export default defineStories(A, {',
      '  stories: { ...common, Une: { a: 1 } },',
      '})',
    ].join('\n')

    const { entries, skipped } = fileWith('A.ts', source)

    expect(entries.map((entry) => entry.name)).toEqual(['Une'])
    expect(skipped).toMatch(/spread/)
  })

  it('laisse de côté une prop dont la clé est calculée', () => {
    const source = [
      "import { A } from '../a'",
      'export default defineStories(A, {',
      '  stories: { Une: { [key]: 1, label: 2 } },',
      '})',
    ].join('\n')

    const { entries } = fileWith('A.ts', source)

    expect(entries[0]?.props).toEqual(['label'])
    expect(entries[0]?.source).toBe('<A label={2} />')
  })

  // La section 2.3 type `Partial<P> | Story<P>` : la seconde forme s'écrit à la
  // main, sans passer par le helper.
  it('lit un Story écrit à la main comme le helper l’écrirait', () => {
    const source = [
      "import { A } from '../a'",
      'export default defineStories(A, {',
      '  stories: { Une: { props: { a: 1 }, options: { b: 2 } } },',
      '})',
    ].join('\n')

    const { entries } = fileWith('A.ts', source)

    expect(entries[0]?.props).toEqual(['a'])
    expect(entries[0]?.options).toEqual({ b: 2 })
  })

  // N'importe quel appel était traité comme le helper, donc son premier
  // argument passait pour des props.
  it('ne prend pas l’appel d’une autre fonction pour le helper', () => {
    const source = [
      "import { A } from '../a'",
      "import { make } from '../make'",
      'export default defineStories(A, {',
      '  stories: { Une: make({ a: 1 }) },',
      '})',
    ].join('\n')

    expect(fileWith('A.ts', source).entries[0]?.props).toEqual([])
  })

  it('suit le helper renommé à l’import', () => {
    const source = [
      "import { A } from '../a'",
      "import { story as s } from '@crypte/react'",
      'export default defineStories(A, {',
      '  stories: { Une: s({ a: 1 }, { b: 2 }) },',
      '})',
    ].join('\n')

    const { entries } = fileWith('A.ts', source)

    expect(entries[0]?.props).toEqual(['a'])
    expect(entries[0]?.options).toEqual({ b: 2 })
  })

  it('trouve un bloc dont la clé est entre guillemets', () => {
    const source = [
      "import { A } from '../a'",
      "export default defineStories(A, { 'meta': { status: 'stable' }, 'props': { a: 1 } })",
    ].join('\n')

    const { entries } = fileWith('A.ts', source)

    expect(entries[0]?.meta).toEqual({ status: 'stable' })
    expect(entries[0]?.props).toEqual(['a'])
  })
})
