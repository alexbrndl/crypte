import { describe, expect, expectTypeOf, it } from 'vitest'
import type { PluginMessage, PreviewMessage, ShellMessage } from '../../src/protocol/channel'
import type { PropDetails, ResolvedPropDetails } from '../../src/protocol/prop'
import type { StoryDefinition, StoryMeta, StoryOptions, Wrap } from '../../src/protocol/story'
import type { TokenValue } from '../../src/protocol/tokens'

// Des gardes de compilation, portés par `satisfies`, `@ts-expect-error` et
// `expectTypeOf`. Leur rouge vient de `vp check`, qui vérifie les types de
// `test/` ; `vp test` les passe au vert quoi qu'ils affirment. Les `expect` ne
// servent qu'à donner un corps aux cas.
//
// Les points d'extension sont remplis par `test/plugin-simulation.d.ts`.

// ── Le canal ─────────────────────────────────────────────────────────────────

// Les messages doivent survivre à un aller-retour JSON : le canal ne transporte
// rien d'autre. Un type laissant passer une fonction romprait l'agnosticisme.
describe('shell messages', () => {
  // Le type refuse ce que la section 5.2 ne porte plus. Sans ce cas, remettre
  // `update-overrides` dans l'union passerait inaperçu. `Extract` rend `never`
  // sur un membre que l'union n'a pas.
  it('refuses the two messages set aside as reserved', () => {
    expectTypeOf<Extract<ShellMessage, { type: 'update-overrides' }>>().toEqualTypeOf<never>()
    expectTypeOf<Extract<ShellMessage, { type: 'set-globals' }>>().toEqualTypeOf<never>()
  })

  // Un membre optionnel vaut `X | undefined` : sans `NonNullable`, le filtre
  // l'écartait de l'union et ce message disparaissait.
  it('accepts a message a plugin declares optional', () => {
    const message = { type: 'viewport:set', width: 320 } satisfies ShellMessage
    expect(message.width).toBe(320)
  })

  // Sans `-?` sur le type mappé, `undefined` devenait un message valide et le
  // canal en postait un à travers la frontière.
  it('does not admit undefined as a message', () => {
    // @ts-expect-error `undefined` n'est pas un message
    const nothing: ShellMessage = undefined
    expect(nothing).toBeUndefined()
  })
})

describe('preview messages', () => {
  it('accepts a message declared by a plugin', () => {
    const message = { type: 'a11y:report', violations: [] } satisfies PreviewMessage
    expect(message.violations).toHaveLength(0)
  })
})

// Un plugin déclarant un message dont le `type` n'est pas un littéral élargirait
// l'union et ferait perdre ses champs à `ready` : le filtre de `MessagesOf`
// l'écarte.
describe('discrimination by the type field', () => {
  it('keeps each message’s own fields despite plugins', () => {
    const read = (message: PreviewMessage) =>
      message.type === 'ready' ? message.protocolVersion : undefined

    expect(read({ type: 'ready', protocolVersion: 1 })).toBe(1)
    expect(read({ type: 'rendered', id: 'x', durationMs: 0 })).toBeUndefined()
  })
})

// Le helper que la spécification recommande à un plugin. Il ne remplace pas le
// filtre : `skipLibCheck` étant courant, un plugin qui déclare dans un `.d.ts`
// ne verra pas cette erreur.
describe('PluginMessage', () => {
  it('refuses a non-literal type', () => {
    // @ts-expect-error `string` n'est pas un littéral
    type Large = PluginMessage<{ type: string; payload: unknown }>
    expectTypeOf<Large>().toBeObject()
  })
})

// ── Les stories ──────────────────────────────────────────────────────────────

interface DemoProps {
  price: number
  label?: string
}

describe('extension points', () => {
  it('accepts settings brought by a plugin', () => {
    const override = { min: 0, max: 500, step: 10 } satisfies PropDetails
    expect(override.max).toBe(500)
  })

  it('accepts options brought by a plugin', () => {
    const options = { responsive: 'mobile' } satisfies StoryOptions
    expect(options.responsive).toBe('mobile')
  })

  // Le cas positif ci-dessus passerait sans plugin simulé : voir l'aiguillage
  // dans `story.ts`.
  it('refuses an option no plugin declared', () => {
    // @ts-expect-error `respnsive` n'est déclaré nulle part
    const typo = { respnsive: 'mobile' } satisfies StoryOptions
    expect(typo).toBeDefined()
  })

  // Sans ce cas, les précédents passeraient sur un type qui n'exige rien.
  it('refuses a key no plugin declared', () => {
    // @ts-expect-error `mni` n'est déclaré nulle part
    const typo = { mni: 0 } satisfies PropDetails
    expect(typo).toBeDefined()
  })
})

describe('StoryDefinition', () => {
  it('refuses details on a prop that does not exist', () => {
    const definition = {
      // @ts-expect-error `discount` n'est pas une prop de DemoProps
      details: { discount: { min: 0 } },
    } satisfies StoryDefinition<DemoProps, unknown>
    expect(definition).toBeDefined()
  })
})

// Les trois formes de la section 2.5 de la spécification.
describe('Wrap', () => {
  const Provider = 'Provider'

  it('accepts a lone component', () => {
    const wrap = Provider satisfies Wrap<string>
    expect(wrap).toBe('Provider')
  })

  it('accepts several wrappers, the first being the outermost', () => {
    const wrap = [Provider, [Provider, { theme: 'dark' }]] satisfies Wrap<string>
    expect(wrap).toHaveLength(2)
  })

  // Garde la branche fonction de revenir dans l'union, et rien de plus : quand
  // le composant est lui-même une fonction, comme en React, une fonction de
  // rendu reste assignable. D'où la règle de la section 2.5, toute fonction
  // reçue est instanciée.
  it('no longer has a function branch in its union', () => {
    // @ts-expect-error la branche `(story) => unknown` a été retirée
    const wrap = ((story: unknown) => story) satisfies Wrap<string>
    expect(wrap).toBeDefined()
  })

  it('refuses props without a component', () => {
    // @ts-expect-error une entrée tableau commence par le composant
    const wrap = [[{ theme: 'dark' }]] satisfies Wrap<string>
    expect(wrap).toBeDefined()
  })
})

describe('StoryMeta', () => {
  it('refuses a status outside the list', () => {
    // @ts-expect-error `archived` n'existe pas
    const invalid = { status: 'archived' } satisfies StoryMeta
    expect(invalid).toBeDefined()
  })
})

// ── Les énumérations du manifeste ────────────────────────────────────────────

describe('TokenValue', () => {
  it('accepts the six kinds of the specification', () => {
    const kinds = ['color', 'dimension', 'fontFamily', 'fontWeight', 'number', 'unknown'] as const

    const values = kinds.map(
      (type) => ({ type, themes: { light: { value: 'x' } } }) satisfies TokenValue,
    )
    expect(values).toHaveLength(6)
  })

  it('refuses an unknown kind', () => {
    // @ts-expect-error `spacing` ne fait pas partie des six natures
    const invalid = { type: 'spacing', themes: { light: { value: '4px' } } } satisfies TokenValue
    expect(invalid).toBeDefined()
  })
})

describe('ResolvedPropDetails', () => {
  it('refuses an unknown kind', () => {
    // @ts-expect-error `date` ne fait pas partie des neuf natures
    const invalid = { type: 'date', required: false } satisfies ResolvedPropDetails
    expect(invalid).toBeDefined()
  })
})
