import { describe, expect, it } from 'vitest'
import type { PreviewMessage, ShellMessage } from '../../src/protocol/channel'
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

describe('PROTOCOL_VERSION', () => {
  it('est exposée par le protocole', () => {
    expect(PROTOCOL_VERSION).toBe(1)
  })
})
