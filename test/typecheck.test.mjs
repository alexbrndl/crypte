import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// Le projet de types annonçait « no errors » en n'ayant **rien** compilé : sans
// `tsconfig` nommé, vitest prend le plus proche, et aucun programme n'incluait
// les `*.test-d.ts`. Une assertion volontairement fausse passait, mesuré.
// Ces cas gardent le câblage, pas les types. Voir docs/internal/architecture.md.

const config = readFileSync('vite.config.ts', 'utf8')
const programme = JSON.parse(readFileSync('tsconfig.types.json', 'utf8'))

test('le projet de types nomme son tsconfig', () => {
  expect(config).toContain("tsconfig: './tsconfig.types.json'")
})

// L'interrupteur, et pas seulement le programme : `enabled: false` laissait le
// projet rendre « 7 passed » sans aucune ligne `Type Errors`, et les autres cas
// d'ici verts, puisque le chemin du tsconfig n'avait pas bougé. Mesuré. Ce qui le
// permet est que ces fichiers tournent aussi à l'exécution, où `expectTypeOf` ne
// fait rien.
test('le typage est allumé', () => {
  expect(config).toContain('enabled: true')
})

test('ce programme inclut les fichiers de types, et rien de construit', () => {
  expect(programme.include).toContain('**/*.test-d.ts')
  expect(programme.exclude).toContain('**/dist/**')
})

// `noEmit` parce que ce programme n'a rien à produire, et le `jsx` du paquet
// React, sans quoi ses fichiers de types ne compilent pas du tout.
test('ce programme ne produit rien et lit le JSX', () => {
  expect(programme.compilerOptions.noEmit).toBe(true)
  expect(programme.compilerOptions.jsx).toBe('react-jsx')
})
