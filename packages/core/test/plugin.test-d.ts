import { expectTypeOf, test } from 'vitest'
import {
  CONTRIBUTABLE,
  type ContributedEntry,
  type CryptePlugin,
  type PanelEvents,
  type PanelProps,
  type StoryEntry,
} from '../src/protocol'

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

// Le contrat d'un panneau, section 6.1 : ce que le shell lui passe et ce qu'il
// peut émettre. `controls` et `a11y` les déclarent avec ces types, donc un
// panneau qui s'en écarte ne compile plus.
const dit = (...args: PanelEvents['inapplicable']) => args
const envoie = (...args: PanelEvents['send']) => args
const edite = (...args: PanelEvents['overrides']) => args

test('a panel folds with a reason, and unfolds with null', () => {
  dit('aucune prop sur ce composant')
  dit(null)
  // @ts-expect-error une raison est du texte
  dit(42)
  // @ts-expect-error se replier sans raison est le panneau vide refusé
  dit()
})

test('a panel sends a message with a type, and edits with values', () => {
  envoie({ type: 'a11y:run' })
  // @ts-expect-error un message sans `type` ne se route pas
  envoie({ rules: ['color-contrast'] })
  edite({ label: 'Bonjour' })
  // @ts-expect-error des valeurs, pas une liste
  edite(['Bonjour'])
})

test('a panel receives the story on display and the last message, or nothing', () => {
  expectTypeOf<PanelProps['entry']>().toEqualTypeOf<StoryEntry | null>()
  expectTypeOf<PanelProps['received']>().toEqualTypeOf<{
    type: string
    [key: string]: unknown
  } | null>()
})

test('a panel declares no event and no prop the shell does not know', () => {
  // @ts-expect-error `toolbar` n'est pas un événement de panneau
  expectTypeOf<Pick<PanelEvents, 'toolbar'>>().toBeObject()
  // @ts-expect-error `selected` n'est pas une prop de panneau
  expectTypeOf<Pick<PanelProps, 'selected'>>().toBeObject()
})

// Le pendant à l'exécution est `surfacesOf`, qui refuse la clé avec sa raison :
// un plugin arrive compilé, et rien n'y vérifie plus ce type.
test('a plugin has no surface other than shell, preview and node', () => {
  // @ts-expect-error `toolbar` n'est pas une surface
  const plugin: CryptePlugin = { name: 'x', toolbar: './toolbar.js' }
  expectTypeOf(plugin).toEqualTypeOf<CryptePlugin>()
})
