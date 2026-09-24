import { expectTypeOf, test } from 'vitest'
import { CONTRIBUTABLE, type ContributedEntry } from '../src/protocol'

// Ce qui lie la liste d'exécution au type. Rien ne le faisait : une nature
// ajoutée à `ManifestEntry` compilait et se faisait refuser par le producteur
// avec « is not a nature a plugin may contribute ». Revue de la PR #51.
test('the runtime list covers exactly the contributable natures', () => {
  expectTypeOf<(typeof CONTRIBUTABLE)[number]>().toEqualTypeOf<ContributedEntry['type']>()
})

// L'autre invariant que le refus de tout `undefined` invoque : aucune nature
// contribuable n'a de propriété optionnelle. Le jour où l'une en gagne, refuser
// devient une sur-restriction, et sans ce cas rien ne le dirait.
test('no contributable nature has an optional property', () => {
  expectTypeOf<Required<ContributedEntry>>().toEqualTypeOf<ContributedEntry>()
})
