import { describe, expect, expectTypeOf, it } from 'vitest'
import type { PluginMessage, PreviewMessage, ShellMessage } from '../../src/protocol/channel'
import { PROTOCOL_VERSION } from '../../src/protocol/channel'

// Les messages doivent survivre à un aller-retour JSON : le canal ne transporte
// rien d'autre. Un type laissant passer une fonction romprait l'agnosticisme.
describe('messages du shell', () => {
  it('accepte les formes de la spécification', () => {
    const messages = [
      { type: 'render', id: 'checkout/ordersummary--par-defaut', overrides: {} },
      { type: 'update-overrides', id: 'badge--par-defaut', overrides: { label: 'Nouveau' } },
      { type: 'set-globals', globals: { theme: 'dark' } },
    ] satisfies ShellMessage[]

    expect(messages).toHaveLength(3)
  })

  // Déclaré par `test/plugin-simulation.d.ts`, comme le ferait un plugin installé.
  it('accepte un message déclaré par un plugin', () => {
    const message = { type: 'controls:open', open: true } satisfies ShellMessage
    expect(message.open).toBe(true)
  })

  // Un membre optionnel vaut `X | undefined` : sans `NonNullable`, le filtre
  // l'écartait de l'union et ce message disparaissait.
  it('accepte un message déclaré optionnel par un plugin', () => {
    const message = { type: 'viewport:set', width: 320 } satisfies ShellMessage
    expect(message.width).toBe(320)
  })

  // Un membre optionnel se transmet au type mappé : sans `-?`, `undefined`
  // devenait un message valide et le canal en postait un à travers la frontière.
  it('n’admet pas undefined comme message', () => {
    // @ts-expect-error `undefined` n'est pas un message
    const nothing: ShellMessage = undefined
    expect(nothing).toBeUndefined()
  })

  it('refuse un type de message inconnu', () => {
    // @ts-expect-error `resize` ne fait pas partie du protocole
    const unknown = { type: 'resize', width: 320 } satisfies ShellMessage
    expect(unknown).toBeDefined()
  })

  it('refuse un message auquel il manque un champ', () => {
    // @ts-expect-error `overrides` est obligatoire
    const incomplete = { type: 'render', id: 'badge--par-defaut' } satisfies ShellMessage
    expect(incomplete).toBeDefined()
  })
})

describe('messages de la preview', () => {
  it('accepte les formes de la spécification', () => {
    const messages = [
      { type: 'ready', protocolVersion: 1 },
      { type: 'rendered', id: 'badge--par-defaut', durationMs: 1.7 },
      { type: 'error', id: 'badge--par-defaut', message: 'boom', stack: 'at …' },
    ] satisfies PreviewMessage[]

    expect(messages).toHaveLength(3)
  })

  it('accepte un message déclaré par un plugin', () => {
    const message = { type: 'a11y:report', violations: [] } satisfies PreviewMessage
    expect(message.violations).toHaveLength(0)
  })

  it('rend la pile facultative sur une erreur', () => {
    const withoutStack = { type: 'error', id: 'x', message: 'boom' } satisfies PreviewMessage
    expect(withoutStack).toBeDefined()
  })
})

// Ce que fait le shell sur chaque message reçu. Un plugin déclarant un message
// dont le `type` n'est pas un littéral élargirait l'union et ferait perdre ses
// champs à `ready` : le filtre de `MessagesOf` l'écarte, ce cas le vérifie.
describe('discrimination par le champ type', () => {
  it('garde les champs propres à chaque message malgré les plugins', () => {
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
  it('accepte un message dont le type est un littéral', () => {
    const message = { type: 'controls:open', open: true } satisfies PluginMessage<{
      type: 'controls:open'
      open: boolean
    }>
    expect(message.open).toBe(true)
  })

  it('refuse un type non littéral', () => {
    // @ts-expect-error `string` n'est pas un littéral
    type Large = PluginMessage<{ type: string; payload: unknown }>
    expectTypeOf<Large>().toBeObject()
  })

  it('refuse un message sans champ type', () => {
    // @ts-expect-error le champ `type` est obligatoire
    type Sans = PluginMessage<{ payload: unknown }>
    expectTypeOf<Sans>().toBeObject()
  })
})

describe('PROTOCOL_VERSION', () => {
  it('est exposée par le protocole', () => {
    expect(PROTOCOL_VERSION).toBe(1)
  })
})
