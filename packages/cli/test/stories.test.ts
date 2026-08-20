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
    expect(skipped).toMatchInlineSnapshot(`"A is not imported by a form this reader can follow"`)
  })

  // Un espace de noms ne nomme aucun export, donc `export: 'A'` désignerait un
  // export qui n'existe pas.
  it('passe un composant lié par un import d’espace de noms', () => {
    const source = "import * as A from '../a'\nexport default defineStories(A)\n"

    expect(fileWith('A.ts', source).skipped).toMatchInlineSnapshot(
      `"A is not imported by a form this reader can follow"`,
    )
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
    expect(skipped).toMatchInlineSnapshot(
      `"stories left out: one whose key is computed at runtime"`,
    )
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
    expect(skipped).toMatchInlineSnapshot(
      `"no story this reader can name: one whose key is computed at runtime"`,
    )
  })

  // Les quatre formes du bloc. Le premier tour n'avait fermé que la dernière,
  // donc `stories: {}` et `stories: shared` redonnaient l'entrée fantôme.
  it('ne replie pas sur Default quand le bloc n’est pas lisible', () => {
    const cases = [
      ['stories: {}', /names no story/],
      ['stories: shared', /not an object literal/],
    ] as const

    for (const [written, reason] of cases) {
      const source = [
        "import { A } from '../a'",
        "import { shared } from '../shared'",
        `export default defineStories(A, { ${written} })`,
      ].join('\n')

      const { entries, skipped } = fileWith('A.ts', source)

      expect(entries, written).toEqual([])
      expect(skipped, written).toMatch(reason)
    }
  })

  // Un cran au-dessus du bloc : c'est l'objet qui le contient qui n'est pas
  // lisible, et un `stories` absent ne prouve alors rien du tout.
  it('ne replie pas sur Default quand la définition n’est pas lisible', () => {
    const cases = [
      ['config', /definition is not an object literal/],
      ['{ ...base }', /a spread in the definition decides the stories/],
      // Mesuré : `{ stories: écrite, ...base }` rend celle de `base`. Le spread
      // ne fait pas qu'ajouter une clé, il remplace celle qui la précède.
      ['{ stories: { Une: { a: 1 } }, ...base }', /a spread in the definition decides the stories/],
    ] as const

    for (const [written, reason] of cases) {
      const source = [
        "import { A } from '../a'",
        "import { base, config } from '../base'",
        `export default defineStories(A, ${written})`,
      ].join('\n')

      const { entries, skipped } = fileWith('A.ts', source)

      expect(entries, written).toEqual([])
      expect(skipped, written).toMatch(reason)
    }
  })

  // Un spread placé avant la clé ne décide de rien : la clé écrite gagne.
  it('lit le bloc stories qu’une définition à spread déclare quand même', () => {
    const source = [
      "import { A } from '../a'",
      "import { base } from '../base'",
      'export default defineStories(A, { ...base, stories: { Une: { a: 1 } } })',
    ].join('\n')

    const { entries, skipped } = fileWith('A.ts', source)

    expect(entries.map((entry) => entry.name)).toEqual(['Une'])
    expect(skipped).toBeUndefined()
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
    expect(skipped).toMatchInlineSnapshot(`"stories left out: one brought by a spread"`)
  })

  // La même règle un cran plus bas : un spread emporte les clés qu'il suit.
  it('laisse de côté une story qu’un spread plus loin peut remplacer', () => {
    const source = [
      "import { A } from '../a'",
      "import { base } from '../base'",
      'export default defineStories(A, {',
      '  stories: { Avant: { a: 1 }, ...base, Apres: { b: 2 } },',
      '})',
    ].join('\n')

    const { entries, skipped } = fileWith('A.ts', source)

    expect(entries.map((entry) => entry.name)).toEqual(['Apres'])
    expect(skipped).toMatchInlineSnapshot(
      `"stories left out: one a later spread may replace, one brought by a spread"`,
    )
  })

  // `find` prenait la première, l'exécution garde la dernière.
  it('garde la dernière valeur d’une clé écrite deux fois', () => {
    const source = [
      "import { A } from '../a'",
      'export default defineStories(A, {',
      '  props: { first: 1 },',
      '  props: { second: 2 },',
      '  stories: { Une: {}, Une: { own: 3 } },',
      '})',
    ].join('\n')

    const { entries } = fileWith('A.ts', source)

    expect(entries.map((entry) => entry.name)).toEqual(['Une'])
    expect(entries[0]?.props).toEqual(['own', 'second'])
  })

  // `shadowed` visait la première occurrence, `propertyOf` lit la dernière. Sur
  // une clé écrite de part et d'autre d'un spread, le bloc était jeté alors que
  // la valeur qui gagne n'est précédée d'aucun spread.
  it('lit une clé réécrite après un spread', () => {
    const source = [
      "import { A } from '../a'",
      "import { base } from '../base'",
      'export default defineStories(A, {',
      '  props: { x: 1 },',
      '  ...base,',
      '  props: { y: 2 },',
      '  stories: { Une: {} },',
      '})',
    ].join('\n')

    const { entries } = fileWith('A.ts', source)

    expect(entries[0]?.props).toEqual(['y'])
    expect(entries[0]?.source).toBe('<A y={2} />')
  })

  // Le nom reste certain, le littéral le pose quoi que porte le spread. La
  // valeur ne l'est pas, donc elle ne part pas dans le code d'appel.
  it('garde le nom mais pas la valeur qu’un spread interne peut remplacer', () => {
    const source = [
      "import { A } from '../a'",
      "import { base } from '../base'",
      'export default defineStories(A, {',
      "  props: { title: 'écrite', ...base, kept: 2 },",
      '  stories: { Une: {} },',
      '})',
    ].join('\n')

    const { entries } = fileWith('A.ts', source)

    expect(entries[0]?.props).toEqual(['kept', 'title'])
    expect(entries[0]?.source).toBe('<A kept={2} />')
  })

  // `props` et `meta` se lisent de la même façon, donc ils courent le même
  // risque : une liste de props fausse ment dans un chiffre de couverture.
  it('ne lit pas les props ni le meta qu’un spread peut remplacer', () => {
    const source = [
      "import { A } from '../a'",
      "import { base } from '../base'",
      'export default defineStories(A, {',
      '  props: { shared: 1 },',
      "  meta: { status: 'stable' },",
      '  ...base,',
      '  stories: { Une: { a: 1 } },',
      '})',
    ].join('\n')

    const { entries } = fileWith('A.ts', source)

    expect(entries[0]?.props).toEqual(['a'])
    expect(entries[0]?.meta).toBeUndefined()
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

// La seconde moitié de la règle du lot 4 : ce qui est laissé de côté est dit.
// L'étage du fichier vit dans `skipped`, celui de l'entrée dans `partial`, et
// une story dont la fiche est partielle rend quand même. `DCJ-217`.
describe('ce que la fiche ne dit pas', () => {
  it('cite le spread que le fichier a écrit', () => {
    const { entries } = fileWith(
      'Spread.js',
      `import { Badge } from './Badge'
       const base = { title: 'x' }
       export default defineStories(Badge, { stories: { Un: { ...base, size: 'lg' } } })`,
    )

    expect(entries[0]?.partial).toBe('`...base` brings props this reader cannot follow')
    expect(entries[0]?.props).toEqual(['size'])
  })

  // La citation tient sur une ligne : un spread peut s'étaler sur dix lignes, et
  // le message va dans un élément de liste ou une ligne de terminal.
  it('met la citation sur une ligne et la coupe si elle est longue', () => {
    const multiligne = fileWith(
      'Multiligne.js',
      `import { Badge } from './Badge'
       const base = {}
       export default defineStories(Badge, { stories: { Un: { ...(
         base
       ), a: 1 } } })`,
    )

    expect(multiligne.entries[0]?.partial).toBe(
      '`...( base )` brings props this reader cannot follow',
    )

    const long = fileWith(
      'Long.js',
      `import { Badge } from './Badge'
       const faire = () => ({})
       export default defineStories(Badge, {
         stories: { Un: { ...faire({ un: 1, deux: 2, trois: 3, quatre: 4 }), a: 1 } },
       })`,
    )

    expect(long.entries[0]?.partial).toBe(
      '`...faire({ un: 1, deux: 2, trois: 3, qu…` brings props this reader cannot follow',
    )
  })

  it('dit la clé de prop calculée sans nommer ce qu’elle vaut', () => {
    const { entries } = fileWith(
      'Calculee.js',
      `import { Badge } from './Badge'
       const cle = 'taille'
       export default defineStories(Badge, { stories: { Un: { [cle]: 'lg', size: 'sm' } } })`,
    )

    expect(entries[0]?.partial).toBe('a prop whose key is computed at runtime is left out')
  })

  // Le bloc partagé vaut pour tout le fichier, donc sa note aussi.
  it('porte la note du bloc partagé sur chaque entrée', () => {
    const { entries } = fileWith(
      'Partage.js',
      `import { Badge } from './Badge'
       const base = { title: 'x' }
       export default defineStories(Badge, {
         props: { ...base, size: 'lg' },
         stories: { Un: {}, Deux: {} },
       })`,
    )

    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.partial)).toEqual([
      '`...base` brings props this reader cannot follow',
      '`...base` brings props this reader cannot follow',
    ])
  })

  // Deux pertes que rien ne disait avant ce lot : un spread de la définition
  // décide `props`, un autre décide `meta`, et l'entrée sortait muette.
  it('dit un spread qui décide le bloc partagé et le meta', () => {
    const { entries } = fileWith(
      'Definition.js',
      `import { Badge } from './Badge'
       const autre = {}
       export default defineStories(Badge, {
         props: { size: 'lg' },
         meta: { status: 'stable' },
         ...autre,
         stories: { Un: {} },
       })`,
    )

    expect(entries[0]?.partial).toBe(
      'a spread in the definition decides the props, so the shared block is not read; ' +
        'a spread in the definition decides `meta`, so no status or owner is read',
    )
  })

  // Une même raison deux fois ne se dit qu'une fois.
  it('ne répète pas la même raison', () => {
    const { entries } = fileWith(
      'Deux.js',
      `import { Badge } from './Badge'
       export default defineStories(Badge, {
         stories: { Un: { [a]: 1, [b]: 2, size: 'lg' } },
       })`,
    )

    expect(entries[0]?.partial).toBe('a prop whose key is computed at runtime is left out')
  })

  // Le cas courant reste muet : un champ posé sur toutes les entrées ferait
  // porter à chaque fiche un avertissement qui ne veut rien dire.
  it('ne pose rien sur une story que le lecteur lit entièrement', () => {
    const { entries } = entriesOf(join(stories, 'checkout', 'OrderSummary.jsx'), fixture, stories)

    expect(entries.every((entry) => entry.partial === undefined)).toBe(true)
  })
})
