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
