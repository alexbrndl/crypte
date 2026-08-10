import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

// La fraîcheur des artefacts n'est pas vérifiée ici par comparaison de dates : le cache
// de tâches restaure dist/ avec les dates d'origine, ce qui produirait de faux échecs.
// Elle est garantie par l'invalidation du cache sur changement des sources, et par
// l'ordre pack puis test en intégration continue.
function bundleOf(entry: string): string {
  expect(existsSync(dist), 'dist absent : lance `vp pack` avant `vp test`').toBe(true)
  const file = readdirSync(dist).find((f) => /\.(js|mjs)$/.test(f) && f.startsWith(entry))
  expect(file, `aucun bundle pour l'entrée ${entry}`).toBeDefined()
  return readFileSync(join(dist, file as string), 'utf8')
}

describe('isolation des entrées de @crypte/core', () => {
  it('protocol ne contient rien de ui ni de preview', () => {
    const protocol = bundleOf('protocol')
    expect(protocol).not.toContain('__crypte_ui__')
    expect(protocol).not.toContain('__crypte_preview__')
  })

  // Assertion principale, ne pas simplifier. Les marqueurs ci-dessus ne suffisent pas :
  // quand protocol importe ui, Rolldown émet un chunk séparé et un `from "./ui.js"`
  // au lieu d'inliner le code. Le marqueur reste absent du bundle et le test passe
  // malgré la fuite. C'est l'absence d'import relatif qui prouve l'isolation.
  it("protocol ne dépend d'aucun chunk partagé", () => {
    const protocol = bundleOf('protocol')
    expect(protocol.match(/\bfrom\s*['"]\.\.?\//g)).toBeNull()
    expect(protocol.match(/\bimport\s*['"]\.\.?\//g)).toBeNull()
  })
})
