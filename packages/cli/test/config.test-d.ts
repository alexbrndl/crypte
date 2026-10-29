import { describe, expectTypeOf, it } from 'vitest'
import type * as protocol from '@crypte/core/protocol'
import type { Adapter } from '@crypte/core/preview'
import type {
  CrypteConfig,
  CryptePlugin,
  Locale,
  PanelEvents,
  PanelProps,
  PluginView,
  PreviewContext,
  PreviewHooks,
  ShellView,
  ViewEvents,
  ViewLabel,
  ViewProps,
} from '../src/config/config'

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
  // qu'on a pensé à nommer : huit aujourd'hui, deux exigées et six non.
  it('covers only the eight keys the type declares', () => {
    expectTypeOf<keyof CrypteConfig>().toEqualTypeOf<
      'stories' | 'adapter' | 'css' | 'components' | 'wrap' | 'plugins' | 'defaultPlugins' | 'vite'
    >()
  })
})

// Un projet installe ce paquet, pas le cœur, qu'il ne peut pas importer : un
// plugin du projet type son panneau et ses hooks d'ici, section 1.4. Les mêmes
// types que ceux du protocole, pas des copies qui en divergeraient.
describe('the plugin types a project imports', () => {
  it('are the protocol types', () => {
    expectTypeOf<CryptePlugin>().toEqualTypeOf<protocol.CryptePlugin>()
    expectTypeOf<PanelProps>().toEqualTypeOf<protocol.PanelProps>()
    expectTypeOf<PanelEvents>().toEqualTypeOf<protocol.PanelEvents>()
    expectTypeOf<PreviewHooks>().toEqualTypeOf<protocol.PreviewHooks>()
    expectTypeOf<PreviewContext>().toEqualTypeOf<protocol.PreviewContext>()
    expectTypeOf<PluginView>().toEqualTypeOf<protocol.PluginView>()
    expectTypeOf<ViewLabel>().toEqualTypeOf<protocol.ViewLabel>()
    expectTypeOf<Locale>().toEqualTypeOf<protocol.Locale>()
    expectTypeOf<ShellView>().toEqualTypeOf<protocol.ShellView>()
    expectTypeOf<ViewProps>().toEqualTypeOf<protocol.ViewProps>()
    expectTypeOf<ViewEvents>().toEqualTypeOf<protocol.ViewEvents>()
  })
})

// Le type d'adaptateur vit dans le noyau : sans lui, `adapter` recevait n'importe
// quoi, et un adaptateur n'avait de contrat que par convention. Que chaque
// adaptateur le satisfasse, ses propres tests de type le tiennent.
describe('the adapter', () => {
  it('is the core type', () => {
    expectTypeOf<CrypteConfig['adapter']>().toEqualTypeOf<Adapter>()
  })

  it('refuses a value that cannot mount a story', () => {
    expectTypeOf<{ name: 'react' }>().not.toExtend<CrypteConfig['adapter']>()
    expectTypeOf<{ mount(): void }>().not.toExtend<CrypteConfig['adapter']>()
  })
})
