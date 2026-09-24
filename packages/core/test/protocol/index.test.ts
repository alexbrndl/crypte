import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { declaredIn, namesInBlocks, REEXPORT_BLOCK } from '../exported-names'

// `index.ts` réexporte tout ce que les modules déclarent, modules pris dans le
// dossier et jamais énumérés à la main. Les consommateurs internes importent
// depuis les fichiers, donc un nom oublié quitterait l'API publique sans faire
// rougir ni le typage ni la construction. Un réexport renommé compte pour son
// nom public, `export *` est refusé.

// La porte d'entrée réexporte-t-elle tout ? Un nom oublié disparaît de l'API
// publique sans que rien d'autre ne bronche.

const here = dirname(fileURLToPath(import.meta.url))
const protocol = join(here, '..', '..', 'src', 'protocol')

// Lus dans le dossier : une liste écrite à la main serait un second oubli possible.
const MODULES = readdirSync(protocol)
  .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
  .map((file) => file.replace(/\.ts$/, ''))

// Les noms d'un module, par son nom de fichier. Ce que les formes couvrent vit
// dans `../exported-names`, partagé avec `spec.test.ts` : deux copies avaient
// divergé, et la plus stricte abandonnait en silence ce qu'elle ne lisait pas.
function namesOf(module: string): string[] {
  return declaredIn(readFileSync(join(protocol, `${module}.ts`), 'utf8'))
}

// Pris dans les accolades, pas dans le texte : une version antérieure trouvait
// les noms dans les commentaires et laissait passer leur retrait.
function reexported(): Set<string> {
  const source = readFileSync(join(protocol, 'index.ts'), 'utf8')
  return new Set(namesInBlocks(source, REEXPORT_BLOCK))
}

describe('protocol entry point', () => {
  const exposed = reexported()

  // Sans ce cas, un dossier mal résolu ne laisserait rien à comparer.
  it('reads the protocol modules', () => {
    expect(MODULES.length).toBeGreaterThan(0)
    expect(MODULES).toContain('manifest')
  })

  // Un `export *` exposerait des noms sans les nommer, hors de portée du contrôle.
  it('uses no wildcard re-export', () => {
    const source = readFileSync(join(protocol, 'index.ts'), 'utf8')
    expect(source).not.toMatch(/export\s+\*/)
  })

  it.each(MODULES)('re-exports everything %s declares', (module) => {
    const names = namesOf(module)

    expect(names.length, `aucune déclaration lue dans ${module}.ts`).toBeGreaterThan(0)

    for (const name of names) {
      expect(exposed, `${name} n'est pas réexporté par index.ts`).toContain(name)
    }
  })

  // Contrôle négatif, posé sur le lecteur et non sur son résultat : un nom
  // absent du dépôt ne prouvait rien, puisque rien ne pouvait l'y mettre.
  it('reads only the names inside a re-export’s braces', () => {
    const source = [
      '// StoryMeta, cité hors de tout bloc',
      "export type { Story } from './story'",
      'export { PROTOCOL_VERSION }',
    ].join('\n')

    expect(namesInBlocks(source, REEXPORT_BLOCK)).toEqual(['Story'])
  })
})
