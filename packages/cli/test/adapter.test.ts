import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test as base } from 'vitest'
import { ConfigError } from '../src/errors'
import { adapterSource, configPackages, previewEntry } from '../src/serve'

// Ce que la preview reprend de `crypte.config.ts`, lu et jamais exécuté.
//
// Un import relatif en ressort en chemin absolu depuis la racine : l'entrée est
// un module virtuel, donc `./src/x` y résoudrait contre son propre chemin. Mesuré
// sur la démonstration, où le `wrap` global ne chargeait pas.
// Voir docs/internal/architecture.md.

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

describe('la source de l’adaptateur', () => {
  test('reprend l’expression et l’import qui la nomme', ({ projet }) => {
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

  // Un test de mots sur le texte brut retenait l'import parce que le nom du
  // plugin apparaissait dans une chaîne de l'expression. Mesuré : la preview
  // chargeait `@vitejs/plugin-react`, donc `node:module`, donc rien.
  test('ne retient pas un import dont le nom n’apparaît que dans une chaîne', ({ projet }) => {
    const read = adapterSource(
      projet(
        [
          "import { createAdapter } from '@crypte/react'",
          "import react from '@vitejs/plugin-react'",
          "export default { adapter: createAdapter({ runtime: 'react' }), vite: { plugins: [react()] } }",
        ].join('\n'),
      ),
    )

    expect(read.imports).toEqual(["import { createAdapter } from '@crypte/react'"])
  })

  // Même chose pour un nom qui n'est qu'une clé d'objet : `react: true` ne
  // désigne pas la variable `react`.
  test('ne retient pas un import dont le nom n’est qu’une clé d’objet', ({ projet }) => {
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

  test('retient l’import d’une clé calculée, qui elle désigne bien la variable', ({ projet }) => {
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
  test('refuse un nom que le fichier calcule lui-même', ({ projet }) => {
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

  // Le refus ne portait que sur l'identifiant en tête : mesuré, un nom local
  // imbriqué passait et l'entrée émettait `createAdapter({ runtime })` sans
  // rien qui déclare `runtime`.
  test('refuse un nom que le fichier calcule, même imbriqué dans l’expression', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "const runtime = 'react'",
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`runtime\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  // `export const` porte sa déclaration un cran plus bas dans l'arbre, et la
  // lire au seul niveau du fichier la rendait invisible.
  test('refuse un nom que le fichier déclare et exporte', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "export const runtime = 'react'",
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`runtime\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  test('refuse un nom que le fichier déstructure', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      'import { opts } from "/opts"',
      'const { runtime } = opts',
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`runtime\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  test('refuse un nom que le fichier déclare dans un tableau', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      'import { list } from "/list"',
      'const [runtime] = list',
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`runtime\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  // Un paramètre porte son propre nom : l'expression l'emmène avec elle, donc
  // il ne désigne pas celui du fichier même quand les deux s'écrivent pareil.
  test('accepte un paramètre qui porte le nom d’une déclaration du fichier', ({ projet }) => {
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

  test('refuse un nom que le fichier tire d’un reste', ({ projet }) => {
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

  test('refuse un nom que le fichier déclare avec une valeur par défaut', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      'import { opts } from "/opts"',
      "const { runtime = 'react' } = opts",
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`runtime\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  // Une énumération déclare un nom comme les autres, et le manquer relâchait un
  // nom pendant vers le navigateur plutôt que d'écarter une configuration.
  test('refuse un nom que le fichier déclare en énumération', ({ projet }) => {
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
  test('accepte un nom qu’un corps de fonction déclare pour lui-même', ({ projet }) => {
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
  test('refuse un nom que le fichier déclare en `var` dans un bloc', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "{ var runtime = 'react' }",
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`runtime\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  test('refuse un nom que le fichier déclare en espace de noms', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      'namespace Runtime {',
      "  export const React = 'react'",
      '}',
      'export default { adapter: createAdapter({ runtime: Runtime.React }) }',
    ].join('\n')

    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`Runtime\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  // Le `var` d'une fonction lui appartient : le remonter au fichier ferait
  // refuser un nom importé qui s'écrit pareil.
  test('accepte un nom importé qu’une fonction du fichier redéclare en `var`', ({ projet }) => {
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

  // `import x = require(…)` déclare un nom sans passer par les imports que le
  // lecteur collecte : accepté, il partait pendant vers le navigateur.
  test('refuse un nom que le fichier déclare par `import =`', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "import runtime = require('./runtime')",
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`runtime\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  test('refuse un nom que le fichier aliase par `import =`', ({ projet }) => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "import * as deep from './deep'",
      'import Runtime = deep.Runtime',
      'export default { adapter: createAdapter({ runtime: Runtime.React }) }',
    ].join('\n')

    expect(() => adapterSource(projet(source))).toThrowErrorMatchingInlineSnapshot(
      `[Error: crypte.config.ts hands \`adapter\` a value it builds itself (\`Runtime\`). Write the adapter in place, or import it: the preview reads this file, it never runs it.]`,
    )
  })

  // Un espace de noms pointé lie son premier segment, et une lecture par types
  // de motifs ne voyait rien dans un nom qualifié.
  test('refuse un nom que le fichier déclare en espace de noms pointé', ({ projet }) => {
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
  test('retient l’import qu’une valeur par défaut de paramètre nomme', ({ projet }) => {
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
  test('retient l’import qu’une clé calculée de paramètre nomme', ({ projet }) => {
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

  test('lie bien la valeur d’une clé de motif, et pas son nom', ({ projet }) => {
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
  test('retient l’import qu’un décorateur de paramètre nomme', ({ projet }) => {
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

  // Une annotation de type ne s'exécute pas : retenir son import ferait charger
  // au navigateur un module que rien n'y appelle.
  test('ne retient pas l’import qu’une annotation de type nomme', ({ projet }) => {
    const read = adapterSource(
      projet(
        [
          "import { createAdapter } from '@crypte/react'",
          "import type { Options } from './options'",
          'export default { adapter: createAdapter({ pick: (opts: Options) => opts }) }',
        ].join('\n'),
      ),
    )

    expect(read.imports).toEqual(["import { createAdapter } from '@crypte/react'"])
  })

  // Un global n'est pas un nom que le fichier calcule : le refuser refuserait
  // `process.env`, que Vite remplace.
  test('accepte un global que le fichier ne déclare pas', ({ projet }) => {
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

  // Même faux positif que la chaîne, un axe plus loin : `opts.react` ne
  // désigne pas la variable `react`.
  test('ne retient pas un import dont le nom n’est que la propriété d’un accès', ({ projet }) => {
    const read = adapterSource(
      projet(
        [
          "import { createAdapter } from '@crypte/react'",
          "import react from '@vitejs/plugin-react'",
          'import { opts } from "/opts"',
          'export default { adapter: createAdapter({ runtime: opts.react }) }',
        ].join('\n'),
      ),
    )

    expect(read.imports).toEqual([
      "import { createAdapter } from '@crypte/react'",
      'import { opts } from "/opts"',
    ])
  })

  test('retient l’import d’un accès calculé, qui lui désigne bien la variable', ({ projet }) => {
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

  test('accepte un nom qui vient d’un import', ({ projet }) => {
    const read = adapterSource(
      projet(['import { adapter } from "/adapter"', 'export default { adapter }'].join('\n')),
    )

    expect(read.expression).toBe('adapter')
    expect(read.imports).toEqual(['import { adapter } from "/adapter"'])
  })

  test('refuse un fichier qui ne déclare pas d’adaptateur', ({ projet }) => {
    expect(() => adapterSource(projet('export default { stories: "stories" }'))).toThrow(
      ConfigError,
    )
  })
})

// Ce qui sort de la racine ne se sert pas : la preview sert le projet, et un
// `../` remonterait où elle n'a rien à offrir. Refusé en nommant le fichier.
describe('un import qui sort du projet', () => {
  test('est refusé, en nommant le spécificateur et le champ', ({ projet }) => {
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
describe('les natures de spécificateur', () => {
  const importe = (spec: string, projet: (source: string) => never) =>
    adapterSource(
      projet(`
        import { A } from '${spec}'
        export default { stories: 's', adapter: A }
      `),
    ).imports

  test.for([
    ['un nom de paquet', 'ma-lib'],
    ['un paquet scopé', '@crypte/react'],
    ['un alias du projet', '@/components/Frame'],
    ['un chemin déjà absolu', '/src/x'],
    ['un module natif', 'node:fs'],
  ] as const)('laisse passer %s tel quel', ([, spec], { projet }) => {
    expect(importe(spec, projet)).toEqual([`import { A } from '${spec}'`])
  })

  // `./a/../b/c` ne se coupe pas au préfixe : il se résout. Une version qui
  // retirait `./` en tête aurait rendu `/a/../b/c`, que le navigateur refuse.
  test.for([
    ['un relatif simple', './src/deep/Frame', '/src/deep/Frame'],
    ['un relatif qui remonte à l’intérieur', './a/../b/c', '/b/c'],
  ] as const)('réécrit %s en chemin de racine', ([, spec, attendu], { projet }) => {
    expect(importe(spec, projet)).toEqual([`import { A } from "${attendu}"`])
  })
})

// Les deux champs croisés, l'axe que l'exploration avait laissé : `adapter` et
// `wrap` peuvent venir du même `import`, et l'émettre deux fois est un
// `SyntaxError` en ESM, donc une preview qui ne charge pas du tout.
describe('adapter et wrap ensemble', () => {
  const entree = (source: string, projet: (source: string) => never) =>
    previewEntry(projet(source), [])

  test('n’émet qu’une fois l’import que les deux champs partagent', ({ projet }) => {
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

  test('garde les deux imports quand les champs viennent de deux fichiers', ({ projet }) => {
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
  test('refuse un wrap que seul un spread apporte', ({ projet }) => {
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

  // Et sans `wrap` du tout, rien ne change : c'est le cas courant.
  test('ne dit rien quand la configuration ne déclare aucun wrap', ({ projet }) => {
    const entry = entree(
      `
        import { createAdapter } from '@crypte/react'
        export default { stories: 's', adapter: createAdapter() }
      `,
      projet,
    )

    expect(entry).toContain('const __crypte_wrap = undefined')
  })
})

// La classe entière, pas un nom : l'entrée est vérifiée par node, qui refuse une
// redéclaration. Un nom importé par la configuration atterrit dans le même
// espace que le préambule, et `import { adapter }` à côté de `const adapter =
// adapter` ne chargeait pas du tout. Mesuré, sur une douzaine de noms.
describe('les noms que l’entrée déclare', () => {
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
    ['modules', 'modules'],
    ['manifest', 'manifest'],
    ['container', 'container'],
    ['render', 'render'],
    ['channel', 'channel'],
    ['propsOfStory', 'propsOfStory'],
    ['wrapsOf', 'wrapsOf'],
    ['createPreviewChannel', 'createPreviewChannel'],
    ['story0', 'story0'],
    ['byId', 'byId'],
    ['wrap', 'wrap'],
    ['paths', 'paths'],
  ] as const)('ne percute pas un import nommé %s', ([, nom], { projet }) => {
    const project = projet(`
      import { ${nom} } from './setup'
      export default { stories: 's', adapter: ${nom} }
    `)

    expect(accepteParNode(previewEntry(project, ['stories/Une.tsx']))).toBe('accepté')
  })

  // Et le préfixe lui-même : un projet qui l'emploierait percuterait, ce qui est
  // dit dans la source plutôt que gardé, faute d'un usage qui le démontre.
  test('émet ses propres noms sous un préfixe réservé', ({ projet }) => {
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
// ce qui est `DCJ-221`. Voir docs/internal/architecture.md.
describe('les paquets de la configuration', () => {
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

  test.for([
    ['un paquet nu', 'ma-lib', ['ma-lib']],
    ['un paquet scopé', '@crypte/react', ['@crypte/react']],
    ['un sous-chemin de paquet', 'react-dom/client', ['react-dom/client']],
  ] as const)('retient %s', ([, spec, attendu], { projet }) => {
    expect(paquets(spec, projet)).toEqual(attendu)
  })

  // Un relatif est déjà réécrit en chemin de racine, donc il n'a rien de nu.
  test.for([
    ['un relatif', './src/adapter'],
    ['un module natif', 'node:fs'],
  ] as const)('écarte %s', ([, spec], { projet }) => {
    expect(paquets(spec, projet)).toEqual([])
  })

  // Le cas trouvé à l'exploration : un alias du projet se lit comme un nom nu, et
  // l'optimiseur n'a aucun paquet à pré-empaqueter derrière.
  test('écarte un alias que le projet déclare', ({ projet }) => {
    expect(paquets('@/adapters/mine', projet, { '@/*': ['src/*'] })).toEqual([])
    expect(paquets('@/adapters/mine', projet)).toEqual(['@/adapters/mine'])
  })

  test('ne nomme qu’une fois le paquet que les deux champs partagent', ({ projet }) => {
    const project = projet(`
      import { createAdapter, Panel } from '@crypte/react'
      export default { stories: 's', adapter: createAdapter(), wrap: Panel }
    `)

    expect(configPackages(project)).toEqual(['@crypte/react'])
  })

  test('ne rend rien quand la configuration n’importe rien', ({ projet }) => {
    expect(configPackages(projet("export default { stories: 's', adapter: {} }"))).toEqual([])
  })
})
