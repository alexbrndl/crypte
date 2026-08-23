import { expectTypeOf, test } from 'vitest'
import { CONTRIBUTABLE, type ContributedEntry } from '../src/protocol'

// Ce qui lie la liste d'exécution au type. Rien ne le faisait : une nature
// ajoutée à `ManifestEntry` compilait et se faisait refuser par le producteur
// avec « is not a nature a plugin may contribute ». Revue de la PR #51.
test('la liste d’exécution couvre exactement les natures contribuables', () => {
  expectTypeOf<(typeof CONTRIBUTABLE)[number]>().toEqualTypeOf<ContributedEntry['type']>()
})
