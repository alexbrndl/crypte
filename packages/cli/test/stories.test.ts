import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { entriesOf } from '../src/stories'

// La lecture d'un fichier de story, sans l'exécuter. Voir docs/contracts.md § 2.

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, 'fixture')

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

describe('story reading', () => {
  // Les formes que `children` peut prendre, et celle qu'il ne prend pas. Sans la
  // seconde moitié, la règle passerait sur un composant qui n'en a aucun.
  it('writes children between the tags, according to its shape', () => {
    const lu = (children: string) =>
      fileWith(
        'A.jsx',
        [
          "import { A } from '../a'",
          `export default defineStories(A, { stories: { Une: { children: ${children} } } })`,
        ].join('\n'),
      ).entries[0]?.source

    // Une chaîne va nue, ce qui est tout l'objet du changement.
    expect(lu("'Neuf'")).toBe('<A>Neuf</A>')

    // Un élément va tel qu'il est écrit : entre accolades il rendrait pareil, et
    // c'est la seule forme où les accolades ne sont manifestement pas ce qu'on
    // écrit.
    expect(lu('<span>Neuf</span>')).toBe('<A><span>Neuf</span></A>')

    // Tout le reste garde ses accolades.
    expect(lu('12')).toBe('<A>{12}</A>')
    expect(lu('items')).toBe('<A>{items}</A>')

    // JSX replie les espaces de bord et lirait autre chose que la story : la
    // chaîne reprend alors ses accolades plutôt que de mentir sur le rendu.
    expect(lu("' bord '")).toBe('<A>{" bord "}</A>')
    expect(lu("''")).toBe('<A>{""}</A>')

    // Une accolade ou un chevron dans le texte serait lu comme du code.
    expect(lu("'{brut}'")).toBe('<A>{"{brut}"}</A>')
    expect(lu("'a < b'")).toBe('<A>{"a < b"}</A>')

    // Une esperluette ouvre une entité : nue, `Tom &amp; Jerry` rendrait
    // `Tom & Jerry`, et `100 &euro;` rendrait `100 €`. Mesuré en transformant
    // le JSX.
    expect(lu("'Tom &amp; Jerry'")).toBe('<A>{"Tom &amp; Jerry"}</A>')
    expect(lu("'100 &euro;'")).toBe('<A>{"100 &euro;"}</A>')

    // Les quatre terminateurs de ligne se replient en une espace, `\r` autant
    // que `\n`.
    expect(lu(String.raw`'a\rb'`)).toBe(String.raw`<A>{"a\rb"}</A>`)
    expect(lu(String.raw`'a\nb'`)).toBe(String.raw`<A>{"a\nb"}</A>`)
  })

  // Les parenthèses survivent à l'analyse, donc l'élément qu'elles entourent
  // n'est pas un `JSXElement`. C'est la forme qu'on écrit dès qu'il tient sur
  // plusieurs lignes, donc le cas même pour lequel ce lot existe.
  it('unwraps the parentheses around an element', () => {
    const lu = (children: string) =>
      fileWith(
        'A.jsx',
        [
          "import { A } from '../a'",
          `export default defineStories(A, { stories: { Une: { children: ${children} } } })`,
        ].join('\n'),
      ).entries[0]?.source

    expect(lu('(<span>Neuf</span>)')).toBe('<A><span>Neuf</span></A>')
    expect(lu('((<span>Neuf</span>))')).toBe('<A><span>Neuf</span></A>')
  })

  // `JSON.stringify` échappe pour JavaScript, pas pour JSX : sur `a"b` il
  // produisait un attribut que le parser refuse, donc du code copié qui ne
  // compile pas. Mesuré avec `parseSync`.
  it('writes an attribute JSX accepts', () => {
    const lu = (valeur: string) =>
      fileWith(
        'A.jsx',
        [
          "import { A } from '../a'",
          `export default defineStories(A, { stories: { Une: { title: ${valeur} } } })`,
        ].join('\n'),
      ).entries[0]?.source

    expect(lu(String.raw`'a"b'`)).toBe(String.raw`<A title={"a\"b"} />`)
    expect(lu("'Tom &amp; Jerry'")).toBe('<A title={"Tom &amp; Jerry"} />')

    // Ce qui reste ordinaire dans un attribut y garde ses guillemets : accolade,
    // chevron et espaces de bord n'y sont pas de la syntaxe.
    expect(lu("'{a} < b '")).toBe('<A title="{a} < b " />')

    // Un littéral d'attribut JSX ne déséchappe rien, donc ce que
    // `JSON.stringify` échappe pour JavaScript y arriverait tel quel : mesuré,
    // `C:\path` sortait avec deux barres et une tabulation sortait en `\t`.
    expect(lu(String.raw`'C:\\path'`)).toBe(String.raw`<A title={"C:\\path"} />`)
    expect(lu(String.raw`'a\tb'`)).toBe(String.raw`<A title={"a\tb"} />`)
  })

  // La moitié qui compte : entre les balises, le texte est émis brut, donc ces
  // mêmes caractères n'y ont besoin de rien. Sans ce cas, on pourrait croire que
  // les deux prédicats devraient être un seul.
  it('leaves a bare slash between the tags', () => {
    const lu = fileWith(
      'A.jsx',
      [
        "import { A } from '../a'",
        String.raw`export default defineStories(A, { stories: { Une: { children: 'C:\\path' } } })`,
      ].join('\n'),
    )

    expect(lu.entries[0]?.source).toBe(String.raw`<A>C:\path</A>`)
  })

  // Un `children` qu'un spread peut remplacer : la prop est **posée**, sa valeur
  // est inconnue, et la section 4.2 interdit de montrer ce que l'exécution n'a
  // pas. La balise reste donc auto-fermante plutôt que de porter un corps
  // inventé.
  //
  // La clé est écrite **avant** le spread, sinon rien ne la pose : `{ ...base }`
  // seul ne nomme aucune prop, donc le cas sortait avant la branche qu'il
  // annonce et restait vert quand on la cassait. Mesuré.
  it('does not invent a body for a children a spread can replace', () => {
    const lu = fileWith(
      'A.jsx',
      [
        "import { A } from '../a'",
        "const base = { children: 'Autre' }",
        "export default defineStories(A, { stories: { Une: { children: 'Neuf', ...base } } })",
      ].join('\n'),
    )

    expect(lu.entries[0]?.props).toEqual(['children'])
    expect(lu.entries[0]?.source).toBe('<A />')
  })

  // Le TypeScript ne passe que si le parseur choisit sa langue sur l'extension.
  it('accepts TypeScript syntax in a .tsx', () => {
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

  // Les formes qui ne sont qu'une supposition : chacune a fait passer un
  // utilitaire pour une story ratée sous une règle de forme ou une autre.
  it.for([
    ['a wrapped component', "import { memo } from 'react'\nexport default memo(() => null)"],
    ['an arrow function', 'export default () => null'],
    ['a barrel that re-exports defineStories', "export { defineStories } from '@crypte/react'"],
    ['an import without a call', "import { defineStories } from '@crypte/react'\nexport default 1"],
    ['a number', 'export default 12'],
    ['no default export', 'const base = { a: 1 }\nexport { base }'],
  ] as const)('stays a guess for %s', ([, source], { expect }) => {
    const lu = fileWith('Suppose.ts', source)

    expect(lu.skipped).toBe('no default export calling defineStories')
    expect(lu.meant).toBeUndefined()
  })

  // Un appel dans un corps de fonction est celui d'une fabrique, pas d'une story :
  // il s'exécute quand la fonction tourne, pas quand le module tourne.
  it.for([
    ['an arrow function', 'export const make = (C) => defineStories(C, {})'],
    ['a function', 'export function make(C) { return defineStories(C, {}) }'],
    ['a class method', 'export class F { make(C) { return defineStories(C, {}) } }'],
  ] as const)('does not take a call inside %s for a story', ([, source]) => {
    const lu = fileWith('Fabrique.ts', `import { defineStories } from '@crypte/react'\n${source}`)

    expect(lu.meant).toBeUndefined()
  })

  // L'alias marche, et échouait en silence avant : ni story, ni message.
  it('reads a story whose defineStories is imported under another name', () => {
    const { entries } = fileWith(
      'Alias.ts',
      `import { defineStories as define } from '@crypte/react'
       import { A } from '../a'
       export default define(A)`,
    )

    expect(entries.map((entry) => entry.id)).toEqual(['alias--default'])
  })

  it('reports an alias its named export makes unresolvable', () => {
    const lu = fileWith(
      'AliasNomme.ts',
      `import { defineStories as define } from '@crypte/react'
       import { A } from '../a'
       export const stories = define(A)`,
    )

    expect(lu.meant).toBe(true)
  })

  it('reads the values JSON can carry', () => {
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
  it('drops a meta with a value that does not survive JSON', () => {
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
  it('skips a file whose component is not imported', () => {
    const { entries, skipped } = fileWith('A.ts', 'export default defineStories(A)\n')

    expect(entries).toEqual([])
    expect(skipped).toMatchInlineSnapshot(`"A is not imported by a form this reader can follow"`)
  })

  // Un espace de noms ne nomme aucun export, donc `export: 'A'` désignerait un
  // export qui n'existe pas.
  it('skips a component bound by a namespace import', () => {
    const source = "import * as A from '../a'\nexport default defineStories(A)\n"

    expect(fileWith('A.ts', source).skipped).toMatchInlineSnapshot(
      `"A is not imported by a form this reader can follow"`,
    )
  })

  it('keeps the original name of a component renamed on import', () => {
    const source = "import { Origin as A } from '../a'\nexport default defineStories(A)\n"

    expect(fileWith('A.ts', source).entries[0]?.component).toEqual({
      name: 'A',
      file: '../a',
      export: 'Origin',
    })
  })

  // Un nom de story est une URL, une clé de baseline et l'ancre d'un
  // commentaire : prendre le nom de la variable donnerait les trois faux.
  it('drops a story with a computed key', () => {
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
  it('does not fall back to Default when the file names unreadable stories', () => {
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
  it('does not fall back to Default when the block is unreadable', () => {
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
  it('does not fall back to Default when the definition is unreadable', () => {
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

  // La même règle un cran plus bas : un spread emporte les clés qu'il suit.
  it('leaves out a story a later spread can replace', () => {
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
  it('keeps the last value of a key written twice', () => {
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
  it('reads a key rewritten after a spread', () => {
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
  it('keeps the name but not the value an inner spread can replace', () => {
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
  it('does not read the props or the meta a spread can replace', () => {
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

  it('leaves out a prop with a computed key', () => {
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
  it('reads a hand-written Story as the helper would write it', () => {
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
  it('does not take a call to another function for the helper', () => {
    const source = [
      "import { A } from '../a'",
      "import { make } from '../make'",
      'export default defineStories(A, {',
      '  stories: { Une: make({ a: 1 }) },',
      '})',
    ].join('\n')

    expect(fileWith('A.ts', source).entries[0]?.props).toEqual([])
  })

  it('follows the helper renamed on import', () => {
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

  it('finds a block with a quoted key', () => {
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
describe('what the entry does not say', () => {
  it('quotes the spread the file wrote', () => {
    const { entries } = fileWith(
      'Spread.js',
      `import { Badge } from './Badge'
       const base = { title: 'x' }
       export default defineStories(Badge, { stories: { Un: { ...base, size: 'lg' } } })`,
    )

    expect(entries[0]?.partial).toBe('`...base` brings props this reader cannot follow')
    expect(entries[0]?.props).toEqual(['size'])
  })

  // La coupe compte des graphèmes : sur des unités UTF-16 elle envoyait un
  // demi-caractère dans le manifeste, qui s'affiche en glyphe de remplacement.
  // Le nom `ab` décale la citation d'une unité, ce qui met la coupe au milieu
  // d'une paire de substitution : sans ce décalage, elle tombait par chance sur
  // une frontière et le cas ne surveillait rien. Mesuré.
  it('does not split a character in two', () => {
    const { entries } = fileWith(
      'Astral.js',
      `import { Badge } from './Badge'
       const faire = () => ({})
       export default defineStories(Badge, {
         stories: { Un: { ...faire({ ab: '${'𝐀'.repeat(30)}' }), b: 1 } },
       })`,
    )

    const note = entries[0]?.partial ?? ''

    expect(note).toContain('…')
    expect(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(note),
    ).toBe(false)
  })

  it('reports the computed prop key without naming its value', () => {
    const { entries } = fileWith(
      'Calculee.js',
      `import { Badge } from './Badge'
       const cle = 'taille'
       export default defineStories(Badge, { stories: { Un: { [cle]: 'lg', size: 'sm' } } })`,
    )

    expect(entries[0]?.partial).toBe('a prop whose key is computed at runtime is left out')
  })

  // Le bloc partagé vaut pour tout le fichier, donc sa note aussi.
  it('carries the shared block note on every entry', () => {
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
  it('reports a spread that decides the shared block and the meta', () => {
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
})
