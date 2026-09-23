import { describe, expectTypeOf, it } from 'vitest'
import type { CrypteConfig } from '../src/config'

// Le cinquième budget de `DCJ-176` : « configuration obligatoire, racine des
// stories et adaptateur, rien d'autre ». C'est un type et pas un chiffre, donc
// il se tient ici et non dans `scripts/budgets.mjs`.

type Requises<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K
}[keyof T]

describe('la configuration obligatoire', () => {
  it('en exige exactement deux', () => {
    expectTypeOf<Requises<CrypteConfig>>().toEqualTypeOf<'stories' | 'adapter'>()
  })

  // Et que le compte porte bien sur toutes les clés, pas seulement sur celles
  // qu'on a pensé à nommer : six aujourd'hui, deux exigées et quatre non.
  it('ne porte que sur les six clés que le type déclare', () => {
    expectTypeOf<keyof CrypteConfig>().toEqualTypeOf<
      'stories' | 'adapter' | 'css' | 'wrap' | 'plugins' | 'vite'
    >()
  })
})
