import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConfigError } from '../src/errors'
import { adapterSource } from '../src/serve'

// Ce que la preview reprend de `crypte.config.ts`, lu et jamais exécuté.
// Voir docs/internal/architecture.md.

function project(source: string) {
  const root = mkdtempSync(join(tmpdir(), 'crypte-adapter-'))
  writeFileSync(join(root, 'crypte.config.ts'), source)

  return { root, config: { stories: 'stories' } } as never
}

describe('la source de l’adaptateur', () => {
  it('reprend l’expression et l’import qui la nomme', () => {
    const read = adapterSource(
      project(
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
  it('ne retient pas un import dont le nom n’apparaît que dans une chaîne', () => {
    const read = adapterSource(
      project(
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
  it('ne retient pas un import dont le nom n’est qu’une clé d’objet', () => {
    const read = adapterSource(
      project(
        [
          "import { createAdapter } from '@crypte/react'",
          "import react from '@vitejs/plugin-react'",
          'export default { adapter: createAdapter({ react: true }), vite: { plugins: [react()] } }',
        ].join('\n'),
      ),
    )

    expect(read.imports).toEqual(["import { createAdapter } from '@crypte/react'"])
  })

  it('retient l’import d’une clé calculée, qui elle désigne bien la variable', () => {
    const read = adapterSource(
      project(
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
  it('refuse un nom que le fichier calcule lui-même', () => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      'const adapter = createAdapter()',
      'export default { adapter }',
    ].join('\n')

    expect(() => adapterSource(project(source))).toThrow(ConfigError)
    expect(() => adapterSource(project(source))).toThrow('a value it builds itself')
  })

  // Le refus ne portait que sur l'identifiant en tête : mesuré, un nom local
  // imbriqué passait et l'entrée émettait `createAdapter({ runtime })` sans
  // rien qui déclare `runtime`.
  it('refuse un nom que le fichier calcule, même imbriqué dans l’expression', () => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "const runtime = 'react'",
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(project(source))).toThrow('a value it builds itself')
  })

  // `export const` porte sa déclaration un cran plus bas dans l'arbre, et la
  // lire au seul niveau du fichier la rendait invisible.
  it('refuse un nom que le fichier déclare et exporte', () => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "export const runtime = 'react'",
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(project(source))).toThrow('a value it builds itself')
  })

  it('refuse un nom que le fichier déstructure', () => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "import { opts } from './opts'",
      'const { runtime } = opts',
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(project(source))).toThrow('a value it builds itself')
  })

  it('refuse un nom que le fichier déclare dans un tableau', () => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "import { list } from './list'",
      'const [runtime] = list',
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(project(source))).toThrow('a value it builds itself')
  })

  // Un paramètre porte son propre nom : l'expression l'emmène avec elle, donc
  // il ne désigne pas celui du fichier même quand les deux s'écrivent pareil.
  it('accepte un paramètre qui porte le nom d’une déclaration du fichier', () => {
    const read = adapterSource(
      project(
        [
          "import { createAdapter } from '@crypte/react'",
          "const opts = { runtime: 'react' }",
          'export default { adapter: createAdapter({ pick: (opts) => opts.runtime }) }',
        ].join('\n'),
      ),
    )

    expect(read.expression).toBe('createAdapter({ pick: (opts) => opts.runtime })')
  })

  it('refuse un nom que le fichier tire d’un reste', () => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "import { list } from './list'",
      'const [mode, ...runtime] = list',
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    // Le nom cité, pas seulement le jet : `mode` est déclaré par le même motif,
    // et une lecture qui s'arrêterait à lui laisserait le reste passer.
    expect(() => adapterSource(project(source))).toThrow('(`runtime`)')
  })

  it('refuse un nom que le fichier déclare avec une valeur par défaut', () => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "import { opts } from './opts'",
      "const { runtime = 'react' } = opts",
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(project(source))).toThrow('a value it builds itself')
  })

  // Une énumération déclare un nom comme les autres, et le manquer relâchait un
  // nom pendant vers le navigateur plutôt que d'écarter une configuration.
  it('refuse un nom que le fichier déclare en énumération', () => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      'enum Runtime {',
      "  React = 'react',",
      '}',
      'export default { adapter: createAdapter({ runtime: Runtime.React }) }',
    ].join('\n')

    expect(() => adapterSource(project(source))).toThrow('a value it builds itself')
  })

  // Ce qu'un corps de fonction déclare lui appartient, au même titre que ses
  // paramètres.
  it('accepte un nom qu’un corps de fonction déclare pour lui-même', () => {
    const read = adapterSource(
      project(
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
  it('refuse un nom que le fichier déclare en `var` dans un bloc', () => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "{ var runtime = 'react' }",
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(project(source))).toThrow('(`runtime`)')
  })

  it('refuse un nom que le fichier déclare en espace de noms', () => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      'namespace Runtime {',
      "  export const React = 'react'",
      '}',
      'export default { adapter: createAdapter({ runtime: Runtime.React }) }',
    ].join('\n')

    expect(() => adapterSource(project(source))).toThrow('(`Runtime`)')
  })

  // Le `var` d'une fonction lui appartient : le remonter au fichier ferait
  // refuser un nom importé qui s'écrit pareil.
  it('accepte un nom importé qu’une fonction du fichier redéclare en `var`', () => {
    const read = adapterSource(
      project(
        [
          "import { createAdapter } from '@crypte/react'",
          "import { runtime } from './runtime'",
          "function make() { var runtime = 'vue'; return runtime }",
          'export default { adapter: createAdapter({ runtime }) }',
        ].join('\n'),
      ),
    )

    expect(read.imports).toContain("import { runtime } from './runtime'")
  })

  // `import x = require(…)` déclare un nom sans passer par les imports que le
  // lecteur collecte : accepté, il partait pendant vers le navigateur.
  it('refuse un nom que le fichier déclare par `import =`', () => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "import runtime = require('./runtime')",
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(project(source))).toThrow('(`runtime`)')
  })

  it('refuse un nom que le fichier aliase par `import =`', () => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "import * as deep from './deep'",
      'import Runtime = deep.Runtime',
      'export default { adapter: createAdapter({ runtime: Runtime.React }) }',
    ].join('\n')

    expect(() => adapterSource(project(source))).toThrow('(`Runtime`)')
  })

  // Un espace de noms pointé lie son premier segment, et une lecture par types
  // de motifs ne voyait rien dans un nom qualifié.
  it('refuse un nom que le fichier déclare en espace de noms pointé', () => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      'namespace runtime.deep {',
      '  export const x = 1',
      '}',
      'export default { adapter: createAdapter({ runtime }) }',
    ].join('\n')

    expect(() => adapterSource(project(source))).toThrow('(`runtime`)')
  })

  // La valeur par défaut d'un paramètre est une expression, pas une liaison :
  // la lire comme telle prendrait un nom que l'expression utilise vraiment pour
  // un nom qu'elle porte, et l'import partirait sans lui.
  it('retient l’import qu’une valeur par défaut de paramètre nomme', () => {
    const read = adapterSource(
      project(
        [
          "import { createAdapter } from '@crypte/react'",
          "import { fallback } from './fallback'",
          'export default { adapter: createAdapter({ pick: (mode = fallback) => mode }) }',
        ].join('\n'),
      ),
    )

    expect(read.imports).toContain("import { fallback } from './fallback'")
  })

  // Une clé calculée de motif est une expression, pas une liaison. Lue comme
  // liaison, elle passait pour un nom que la fonction porte, donc son import ne
  // partait pas et le nom partait pendant.
  it('retient l’import qu’une clé calculée de paramètre nomme', () => {
    const read = adapterSource(
      project(
        [
          "import { createAdapter } from '@crypte/react'",
          "import { field } from './field'",
          'export default { adapter: createAdapter({ pick: ({ [field]: value }) => value }) }',
        ].join('\n'),
      ),
    )

    expect(read.imports).toContain("import { field } from './field'")
  })

  it('lie bien la valeur d’une clé de motif, et pas son nom', () => {
    const source = [
      "import { createAdapter } from '@crypte/react'",
      "import { opts } from './opts'",
      'const { runtime: mode } = opts',
      'export default { adapter: createAdapter({ mode }) }',
    ].join('\n')

    expect(() => adapterSource(project(source))).toThrow('(`mode`)')
  })

  // Un décorateur pend à l'identifiant qu'il décore : s'arrêter sur celui-ci
  // laissait le nom du décorateur derrière, donc son import ne partait pas.
  it('retient l’import qu’un décorateur de paramètre nomme', () => {
    const read = adapterSource(
      project(
        [
          "import { createAdapter } from '@crypte/react'",
          "import { field } from './field'",
          'export default {',
          '  adapter: createAdapter({ pick: class { constructor(@field() x) { void x } } }),',
          '}',
        ].join('\n'),
      ),
    )

    expect(read.imports).toContain("import { field } from './field'")
  })

  // Un global n'est pas un nom que le fichier calcule : le refuser refuserait
  // `process.env`, que Vite remplace.
  it('accepte un global que le fichier ne déclare pas', () => {
    const read = adapterSource(
      project(
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
  it('ne retient pas un import dont le nom n’est que la propriété d’un accès', () => {
    const read = adapterSource(
      project(
        [
          "import { createAdapter } from '@crypte/react'",
          "import react from '@vitejs/plugin-react'",
          "import { opts } from './opts'",
          'export default { adapter: createAdapter({ runtime: opts.react }) }',
        ].join('\n'),
      ),
    )

    expect(read.imports).toEqual([
      "import { createAdapter } from '@crypte/react'",
      "import { opts } from './opts'",
    ])
  })

  it('retient l’import d’un accès calculé, qui lui désigne bien la variable', () => {
    const read = adapterSource(
      project(
        [
          "import { createAdapter } from '@crypte/react'",
          "import key from './key'",
          "import { opts } from './opts'",
          'export default { adapter: createAdapter({ runtime: opts[key] }) }',
        ].join('\n'),
      ),
    )

    expect(read.imports).toHaveLength(3)
  })

  it('accepte un nom qui vient d’un import', () => {
    const read = adapterSource(
      project(["import { adapter } from './adapter'", 'export default { adapter }'].join('\n')),
    )

    expect(read.expression).toBe('adapter')
    expect(read.imports).toEqual(["import { adapter } from './adapter'"])
  })

  it('refuse un fichier qui ne déclare pas d’adaptateur', () => {
    expect(() => adapterSource(project('export default { stories: "stories" }'))).toThrow(
      ConfigError,
    )
  })
})
