import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Le shell servi est une copie préconstruite, pas les sources. Éditer
// `apps/shell/src` sans reconstruire laisse donc tous les cas navigateur juger
// la version d'avant, et ils passent. Mesuré : une heure perdue à chercher
// pourquoi l'arbre ne se rafraîchissait pas, alors que le correctif était là et
// que le shell servi ne le portait pas.
//
// Voir docs/internal/architecture.md.

const here = dirname(fileURLToPath(import.meta.url))
const sources = join(here, '..', '..', '..', 'apps', 'shell', 'src')
const copy = join(here, '..', 'dist', 'shell')

function newest(folder: string): number {
  return Math.max(
    ...readdirSync(folder, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile())
      .map((entry) => statSync(join(entry.parentPath, entry.name)).mtimeMs),
  )
}

describe('la copie du shell', () => {
  it('n’est pas plus vieille que ses sources', () => {
    expect(
      newest(copy) >= newest(sources),
      'la copie du shell est plus vieille que `apps/shell/src` : lance `vp run -r pack`, ' +
        'sinon les cas navigateur jugent la version d’avant et passent quand même',
    ).toBe(true)
  })
})
