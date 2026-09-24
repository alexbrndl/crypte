import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test as base } from 'vitest'
import { ConfigError } from '../src/errors'
import { adapterSource, configPackages } from '../src/config-source'
import { previewEntry } from '../src/serve'

// Ce que la preview reprend de `crypte.config.ts`, lu et jamais exécuté.
//
// Un import relatif en ressort en chemin absolu depuis la racine : l'entrée est
// un module virtuel, donc `./src/x` y résoudrait contre son propre chemin. Mesuré
// sur la démonstration, où le `wrap` global ne chargeait pas.

// Une fixture plutôt qu'une fonction libre : vitest la démonte après chaque cas,
// même si le cas lève. Écrite en fonction, elle laissait un dossier par appel,
// soit trente-deux par lancement, que personne ne ramassait.
const test = base.extend<{ projet: (source: string) => never }>({
  // Le paramètre vide est la forme que vitest lit pour savoir quelles fixtures
  // initialiser. Le renommer fait collecter zéro test : mesuré. Le lint le
  // signale, et c'est le seul avertissement que ce dépôt accepte sciemment.
  projet: async ({}, use) => {
    const roots: string[] = []

    await use((source: string) => {
      const root = mkdtempSync(join(tmpdir(), 'crypte-adapter-'))
      writeFileSync(join(root, 'crypte.config.ts'), source)
      roots.push(root)

      return { root, config: { stories: 'stories' } } as never
    })

    for (const root of roots) rmSync(root, { recursive: true, force: true })
  },
})

describe('adapter source', () => {
  test('takes the expression and the import that names it', ({ projet }) => {
    const read = adapterSource(
      projet(
        [
          "import { createAdapter } from '@crypte/react'",
          'export default { adapter: createAdapter() }',
        ].join('\n'),
      ),
    )

    expect(read.expression).toBe('createAdapter()')
    expect(read.imports).toEqual(["import { createAdapter } from '@crypte/react'"])
  })

  test('does not take a computed key for the field', ({ projet }) => {
    expect(() => adapterSource(projet('export default { [adapter]: zzz(), stories: 1 }'))).toThrow(
      ConfigError,
    )
  })

  // Même chose pour un nom qui n'est qu'une clé d'objet : `react: true` ne
  // désigne pas la variable `react`.
  test('does not keep an import whose name is only an object key', ({ projet }) => {
    const read = adapterSource(
      projet(
        [
          "import { createAdapter } from '@crypte/react'",
          "import react from '@vitejs/plugin-react'",
          'export default { adapter: createAdapter({ react: true }), vite: { plugins: [react()] } }',
        ].join('\n'),
      ),
    )

    expect(read.imports).toEqual(["import { createAdapter } from '@crypte/react'"])
  })

  test('keeps the import of a computed key, which does refer to the variable', ({ projet }) => {
    const read = adapterSource(
      projet(
        [
          "import { createAdapter } from '@crypte/react'",
          "import key from './key'",
          'export default { adapter: createAdapter({ [key]: true }) }',
        ].join('\n'),
      ),
    )

    expect(read.imports).toHaveLength(2)
  })

  // Le message exigeait « written in place » sans que rien ne le vérifie :
  // l'entrée émettait `const adapter = adapter`, donc une ReferenceError avant
  // l'ouverture du canal, donc un cadre vide sans rien à dire.
  test('refuses a name the file computes itself', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      'const adapter = createAdapter()',
      'export default { adapter }',
    ].join('\n')

    expect(() => adapterSource(projet(source))).toThrow(ConfigError)
    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`adapter\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  // `export const` porte sa déclaration un cran plus bas dans l'arbre, et la
  // lire au seul niveau du fichier la rendait invisible.
  test('refuses a name the file declares and exports', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "export const runtime = 'react'",
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`runtime\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  // Un paramètre porte son propre nom : l'expression l'emmène avec elle, donc
  // il ne désigne pas celui du fichier même quand les deux s'écrivent pareil.
  test('accepts a parameter named after a declaration of the file', ({ projet }) => {
    const read = adapterSource(
      projet(
        [
          "import { createAdapter } from '@crypte/react'",
          "const opts = { runtime: 'react' }",
          'export default { adapter: createAdapter({ pick: (opts) => opts.runtime }) }',
        ].join('\n'),
      ),
    )

    expect(read.expression).toBe('createAdapter({ pick: (opts) => opts.runtime })')
  })

  test('refuses a name the file takes from a rest element', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      'import { list } from "/list"',
      'const [mode, ...runtime] = list',
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    // Le nom cité, pas seulement le jet : `mode` est déclaré par le même motif,
    // et une lecture qui s'arrêterait à lui laisserait le reste passer.
    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`runtime\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  // Une énumération déclare un nom comme les autres, et le manquer relâchait un
  // nom pendant vers le navigateur plutôt que d'écarter une configuration.
  test('refuses a name the file declares as an enum', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      'enum Runtime {',
      "  React = 'react',",
      '}',
      'export default { adapter: createAdapter({ runtime: Runtime.React }) }',
    ].join('\n')

    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`Runtime\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  // Ce qu'un corps de fonction déclare lui appartient, au même titre que ses
  // paramètres.
  test('accepts a name a function body declares for itself', ({ projet }) => {
    const read = adapterSource(
      projet(
        [
          "import { createAdapter } from '@crypte/react'",
          "const runtime = 'react'",
          'export default {',
          '  adapter: createAdapter({',
          "    pick: () => { const runtime = 'vue'; return runtime },",
          '  }),',
          '}',
        ].join('\n'),
      ),
    )

    expect(read.imports).toEqual(["import { createAdapter } from '@crypte/react'"])
  })

  // Un `var` appartient au fichier, pas au bloc où il est écrit. Lu instruction
  // par instruction il paraissait absent, et le nom partait pendant.
  test('refuses a name the file declares with `var` in a block', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "{ var runtime = 'react' }",
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`runtime\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  // Le `var` d'une fonction lui appartient : le remonter au fichier ferait
  // refuser un nom importé qui s'écrit pareil.
  test('accepts an imported name that a function of the file redeclares with `var`', ({
    projet,
  }) => {
    const read = adapterSource(
      projet(
        [
          "import { createAdapter } from '@crypte/react'",
          'import { runtime } from "/runtime"',
          "function make() { var runtime = 'vue'; return runtime }",
          'export default { adapter: createAdapter({ runtime }) }',
        ].join('\n'),
      ),
    )

    expect(read.imports).toContain('import { runtime } from "/runtime"')
  })

  // Un espace de noms pointé lie son premier segment, et une lecture par types
  // de motifs ne voyait rien dans un nom qualifié.
  test('refuses a name the file declares as a dotted namespace', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      'namespace runtime.deep {',
      '  export const x = 1',
      '}',
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`runtime\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  // La valeur par défaut d'un paramètre est une expression, pas une liaison :
  // la lire comme telle prendrait un nom que l'expression utilise vraiment pour
  // un nom qu'elle porte, et l'import partirait sans lui.
  test('keeps the import a parameter default value names', ({ projet }) => {
    const read = adapterSource(
      projet(
        [
          "import { createAdapter } from '@crypte/react'",
          'import { fallback } from "/fallback"',
          'export default { adapter: createAdapter({ pick: (mode = fallback) => mode }) }',
        ].join('\n'),
      ),
    )

    expect(read.imports).toContain('import { fallback } from "/fallback"')
  })

  // Une clé calculée de motif est une expression, pas une liaison. Lue comme
  // liaison, elle passait pour un nom que la fonction porte, donc son import ne
  // partait pas et le nom partait pendant.
  test('keeps the import a computed parameter key names', ({ projet }) => {
    const read = adapterSource(
      projet(
        [
          "import { createAdapter } from '@crypte/react'",
          'import { field } from "/field"',
          'export default { adapter: createAdapter({ pick: ({ [field]: value }) => value }) }',
        ].join('\n'),
      ),
    )

    expect(read.imports).toContain('import { field } from "/field"')
  })

  test('binds the value of a pattern key, not its name', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      'import { opts } from "/opts"',
      'const { runtime: mode } = opts',
      'export default { adapter: createAdapter({ mode }) }',
    ].join('\n')

    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`mode\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  // Un décorateur pend à l'identifiant qu'il décore : s'arrêter sur celui-ci
  // laissait le nom du décorateur derrière, donc son import ne partait pas.
  test('keeps the import a parameter decorator names', ({ projet }) => {
    const read = adapterSource(
      projet(
        [
          "import { createAdapter } from '@crypte/react'",
          'import { field } from "/field"',
          'export default {',
          '  adapter: createAdapter({ pick: class { constructor(@field() x) { void x } } }),',
          '}',
        ].join('\n'),
      ),
    )

    expect(read.imports).toContain('import { field } from "/field"')
  })

  // Un global n'est pas un nom que le fichier calcule : le refuser refuserait
  // `process.env`, que Vite remplace.
  test('accepts a global the file does not declare', ({ projet }) => {
    const read = adapterSource(
      projet(
        [
          "import { createAdapter } from '@crypte/react'",
          'export default { adapter: createAdapter({ mode: process.env.MODE }) }',
        ].join('\n'),
      ),
    )

    expect(read.expression).toBe('createAdapter({ mode: process.env.MODE })')
  })

  test('keeps the import of a computed access, which does refer to the variable', ({ projet }) => {
    const read = adapterSource(
      projet(
        [
          "import { createAdapter } from '@crypte/react'",
          "import key from './key'",
          'import { opts } from "/opts"',
          'export default { adapter: createAdapter({ runtime: opts[key] }) }',
        ].join('\n'),
      ),
    )

    expect(read.imports).toHaveLength(3)
  })

  test('refuses a file that declares no adapter', ({ projet }) => {
    expect(() => adapterSource(projet('export default { stories: "stories" }'))).toThrow(
      ConfigError,
    )
  })
})

// Ce qui sort de la racine ne se sert pas : la preview sert le projet, et un
// `../` remonterait où elle n'a rien à offrir. Refusé en nommant le fichier.
describe('an import that leaves the project', () => {
  test('is refused, naming the specifier and the field', ({ projet }) => {
    const project = projet(`
      import { createAdapter } from '../ailleurs/adapter'
      export default { stories: 's', adapter: createAdapter() }
    `)

    expect(() => adapterSource(project)).toThrow(ConfigError)
    expect(() => adapterSource(project)).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts imports \`../ailleurs/adapter\` for \`adapter\`, which is outside the project. The preview serves the project, so move the file under it or import a package.]`,
    )
  })
})

// Les natures de spécificateur, croisées : seul le relatif est réécrit, et il
// l'est par résolution, pas par découpage de chaîne. Mesuré à l'exploration.
describe('specifier kinds', () => {
  const importe = (spec: string, projet: (source: string) => never) =>
    adapterSource(
      projet(`
        import { A } from '${spec}'
        export default { stories: 's', adapter: A }
      `),
    ).imports

  // `./a/../b/c` ne se coupe pas au préfixe : il se résout. Une version qui
  // retirait `./` en tête aurait rendu `/a/../b/c`, que le navigateur refuse.
  test.for([['a relative path that climbs back inside', './a/../b/c', '/b/c']] as const)(
    'rewrites %s as a root path',
    ([, spec, attendu], { projet }) => {
      expect(importe(spec, projet)).toEqual([`import { A } from "${attendu}"`])
    },
  )
})

// Les deux champs croisés, l'axe que l'exploration avait laissé : `adapter` et
// `wrap` peuvent venir du même `import`, et l'émettre deux fois est un
// `SyntaxError` en ESM, donc une preview qui ne charge pas du tout.
describe('adapter and wrap together', () => {
  const entree = (source: string, projet: (source: string) => never) =>
    previewEntry(projet(source), [])

  test('emits the import both fields share only once', ({ projet }) => {
    const entry = entree(
      `
        import { createAdapter, Panel } from './setup'
        export default { stories: 's', adapter: createAdapter(), wrap: Panel }
      `,
      projet,
    )

    expect(entry.split('\n').filter((une) => une.includes('/setup'))).toEqual([
      'import { createAdapter, Panel } from "/setup"',
    ])
    expect(entry).toContain('const __crypte_wrap = Panel')
  })

  test('keeps both imports when the fields come from two files', ({ projet }) => {
    const entry = entree(
      `
        import { createAdapter } from './adapter'
        import { Panel } from './frame'
        export default { stories: 's', adapter: createAdapter(), wrap: Panel }
      `,
      projet,
    )

    expect(entry).toContain('import { createAdapter } from "/adapter"')
    expect(entry).toContain('import { Panel } from "/frame"')
  })

  // Un `wrap` que le lecteur ne voit pas se dit, au lieu de rendre sans lui : la
  // configuration exécutée en porte un, le texte non.
  test('refuses a wrap that only a spread provides', ({ projet }) => {
    const project = projet(`
      import { createAdapter } from '@crypte/react'
      const shared = { wrap: 'Panel' }
      export default { ...shared, stories: 's', adapter: createAdapter() }
    `)
    // La configuration exécutée porte le `wrap`, le texte ne le montre pas :
    // c'est exactement ce que le spread produit.
    const avecWrap = {
      root: (project as unknown as { root: string }).root,
      config: { stories: 's', wrap: 'Panel' },
    } as never

    expect(() => previewEntry(avecWrap, [])).toThrow(ConfigError)
    expect(() => previewEntry(avecWrap, [])).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts declares \`wrap\` somewhere the preview cannot read, a spread for instance. Write it in place: the preview reads this file, it never runs it.]`,
    )
  })
})

// La classe entière, pas un nom : l'entrée est vérifiée par node, qui refuse une
// redéclaration. Un nom importé par la configuration atterrit dans le même
// espace que le préambule, et `import { adapter }` à côté de `const adapter =
// adapter` ne chargeait pas du tout. Mesuré, sur une douzaine de noms.
describe('names the entry declares', () => {
  // Node lit du JavaScript : une configuration en TypeScript dans cette table
  // ferait échouer le contrôle sur la syntaxe, pas sur une redéclaration.
  const accepteParNode = (entry: string) => {
    try {
      execFileSync('node', ['--input-type=module', '--check'], { input: entry, stdio: 'pipe' })

      return 'accepté'
    } catch (error) {
      const sortie = String((error as { stderr?: Buffer }).stderr)

      return sortie.split('\n').find((une) => une.includes('Error')) ?? 'refusé'
    }
  }

  test.for([
    ['adapter', 'adapter'],
    ['container', 'container'],
    ['render', 'render'],
    ['channel', 'channel'],
    ['wrap', 'wrap'],
  ] as const)('does not collide with an import named %s', ([, nom], { projet }) => {
    const project = projet(`
      import { ${nom} } from './setup'
      export default { stories: 's', adapter: ${nom} }
    `)

    expect(accepteParNode(previewEntry(project, ['stories/Une.tsx']))).toBe('accepté')
  })

  // Et le préfixe lui-même : un projet qui l'emploierait percuterait, ce qui est
  // dit dans la source plutôt que gardé, faute d'un usage qui le démontre.
  test('emits its own names under a reserved prefix', ({ projet }) => {
    const entry = previewEntry(
      projet(`
        import { createAdapter } from '@crypte/react'
        export default { stories: 's', adapter: createAdapter() }
      `),
      [],
    )

    expect(entry).toContain('const __crypte_adapter = createAdapter()')
    expect(entry).not.toMatch(/^const adapter =/m)
  })
})

// Les paquets que l'optimiseur doit pré-empaqueter, tirés des mêmes imports. Un
// paquet lié servi comme module du graphe garde des URL de dépendances périmées,
// ce qui est `DCJ-221`.
describe('configuration packages', () => {
  const paquets = (
    spec: string,
    projet: (source: string) => never,
    paths?: Record<string, string[]>,
  ) =>
    configPackages({
      ...(projet(`
        import { A } from '${spec}'
        export default { stories: 's', adapter: A }
      `) as unknown as { root: string }),
      config: { stories: 's' },
      paths: paths ? { paths, base: '/', files: [] } : undefined,
    } as never)

  // Un relatif est déjà réécrit en chemin de racine, donc il n'a rien de nu.
  test.for([['a built-in module', 'node:fs']] as const)('skips %s', ([, spec], { projet }) => {
    expect(paquets(spec, projet)).toEqual([])
  })

  // Le cas trouvé à l'exploration : un alias du projet se lit comme un nom nu, et
  // l'optimiseur n'a aucun paquet à pré-empaqueter derrière.
  test('skips an alias the project declares', ({ projet }) => {
    expect(paquets('@/adapters/mine', projet, { '@/*': ['src/*'] })).toEqual([])
    expect(paquets('@/adapters/mine', projet)).toEqual(['@/adapters/mine'])
  })
})

// La nature de l'import, second axe : un paquet de types n'a aucun paquet à
// pré-empaqueter derrière, et Vite le disait à chaque démarrage.
describe('a type import', () => {
  test('goes neither into the entry nor to the optimizer', ({ projet }) => {
    const project = projet(`
      import { createAdapter } from '@crypte/react'
      import type { P } from '@acme/types'
      export default { stories: 's', adapter: createAdapter<P>() }
    `)

    expect(configPackages(project)).toEqual(['@crypte/react'])
    expect(adapterSource(project).imports).toEqual([
      "import { createAdapter } from '@crypte/react'",
    ])
  })

  // L'autre sens, et le plus grave : un nœud `TS…` qui porte une valeur et qu'on
  // saute fait disparaître un import dont l'entrée servie a besoin. Les cinq
  // expressions sont les seules entrées, et une assertion à l'ancienne est celle
  // qui perdrait sa valeur.
  test.for([
    ['an old-style assertion', '<P>fait'],
    ['an as', 'fait as P'],
    ['a satisfies', 'fait satisfies P'],
    ['a non-null', 'fait!'],
    ['an instantiation', 'fait<P>'],
  ] as const)('keeps the value behind %s', ([, expression], { projet }) => {
    const project = projet(`
      import type { P } from '@acme/types'
      import { fait } from '@acme/valeur'
      export default { stories: 's', adapter: ${expression} }
    `)

    expect(configPackages(project)).toEqual(['@acme/valeur'])
    expect(adapterSource(project).imports).toEqual(["import { fait } from '@acme/valeur'"])
  })

  // Depuis que l'entrée est compilée (`DCJ-224`), les formes de déclaration
  // s'exécutent, donc leur import doit voyager. Sauter le nœud laissait l'entrée
  // lire un nom qu'elle n'importait pas, c'est-à-dire un `ReferenceError` et un
  // cadre vide.
  test.for([
    ['a parameter property', 'new (class { constructor(public a = fait) {} })()'],
    ['an enum member', '(() => { enum E { A = fait } return E.A })()'],
  ] as const)('keeps the value behind %s', ([, expression], { projet }) => {
    const project = projet(`
      import { fait } from '@acme/valeur'
      export default { stories: 's', adapter: ${expression} }
    `)

    expect(configPackages(project)).toEqual(['@acme/valeur'])
    expect(adapterSource(project).imports).toEqual(["import { fait } from '@acme/valeur'"])
  })

  // Et les pièges de ces formes, trouvés par deux revues : un membre
  // d'énumération se nomme lui-même, et une déclaration nichée dans un bloc ne
  // nomme rien du fichier.
  test.for([
    [
      'a member name shared with a type',
      '(() => { enum E { P = 1 } return createAdapter(E.P) })()',
      '',
    ],
  ] as const)('skips %s', ([, expression, tête], { projet }) => {
    const project = projet(`
      import { createAdapter } from '@crypte/react'
      import type { P } from '@acme/types'
      ${tête}
      export default { stories: 's', adapter: ${expression} }
    `)

    expect(configPackages(project)).toEqual(['@crypte/react'])
  })

  // Même espèce : une expression nommée porte son nom, un bloc statique porte
  // ses déclarations. Chacune produisait un faux refus sur du JavaScript valide.
  test.for([
    ['a named class', 'new (class Nom { mount() { return createAdapter() } })()'],
    [
      'a static block',
      'new (class { static { const Nom = 2; void Nom } mount() { return createAdapter() } })()',
    ],
  ] as const)('does not blame the configuration because of %s', ([, expression], { projet }) => {
    const project = projet(`
      import { createAdapter } from '@crypte/react'
      const Nom = 1
      export default { stories: 's', adapter: ${expression} }
    `)

    expect(configPackages(project)).toEqual(['@crypte/react'])
  })

  // Et le refus reste vivant pour un nom que l'expression lit vraiment.
  test('still refuses a name the configuration builds', ({ projet }) => {
    const project = projet(`
      import { createAdapter } from '@crypte/react'
      const Nom = 1
      export default { stories: 's', adapter: new (class { mount() { return createAdapter(Nom) } })() }
    `)

    expect(() => configPackages(project)).toThrow('builds itself')
  })
})
