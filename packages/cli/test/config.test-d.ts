import { describe, expectTypeOf, it } from 'vitest'
import type { CrypteConfig } from '../src/config'

// Le cinquième budget de `DCJ-176` : « configuration obligatoire, racine des
// stories et adaptateur, rien d'autre ». C'est un type et pas un chiffre, donc
// il se tient ici et non dans `scripts/budgets.mjs`.

type Requises<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K
}[keyof T]

describe('the required config', () => {
  it('requires exactly two keys', () => {
    expectTypeOf<Requises<CrypteConfig>>().toEqualTypeOf<'stories' | 'adapter'>()
  })

  // Et que le compte porte bien sur toutes les clés, pas seulement sur celles
  // qu'on a pensé à nommer : six aujourd'hui, deux exigées et quatre non.
  it('covers only the six keys the type declares', () => {
    expectTypeOf<keyof CrypteConfig>().toEqualTypeOf<
      'stories' | 'adapter' | 'css' | 'wrap' | 'plugins' | 'vite'
    >()
  })
})
