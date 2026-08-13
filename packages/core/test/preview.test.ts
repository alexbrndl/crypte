import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION } from '../src/protocol/channel'
import { createPreviewChannel } from '../src/preview/index'
import { collect, windowAt } from './fake-window'

const ORIGIN = 'https://crypte.test'
const AILLEURS = 'https://ailleurs.test'

const global = globalThis as unknown as { window?: unknown }

let preview = windowAt(ORIGIN)
let shell = windowAt(ORIGIN)
let recus: unknown[] = []

beforeEach(() => {
  preview = windowAt(ORIGIN)
  shell = windowAt(ORIGIN)
  preview.parent = shell
  shell.sender = preview
  recus = collect(shell)
  global.window = preview
})

afterEach(() => {
  delete global.window
})

const RENDER = { type: 'render', id: 'badge--par-defaut', overrides: { label: 'Neuf' } }

// Ce que le shell envoie, tel qu'il arrive : même origine, et le parent pour source.
function envoie(data: unknown, { origin = ORIGIN, source = shell as unknown } = {}) {
  preview.deliver({ data, origin, source }, ORIGIN)
}

describe('annonce', () => {
  it('dit ready au montage, avec la version du protocole', () => {
    createPreviewChannel({ render: () => {} })

    expect(recus).toEqual([{ type: 'ready', protocolVersion: PROTOCOL_VERSION }])
  })

  it('n’annonce rien à un parent d’une autre origine', () => {
    const etranger = windowAt(AILLEURS)
    etranger.sender = preview
    preview.parent = etranger
    const chezLui = collect(etranger)

    createPreviewChannel({ render: () => {} })

    expect(chezLui).toEqual([])
  })
})

describe('rendu', () => {
  it('rend, puis répond avec une durée', () => {
    const rendus: unknown[] = []
    createPreviewChannel({ render: (id, overrides) => rendus.push([id, overrides]) })

    envoie(RENDER)

    expect(rendus).toEqual([[RENDER.id, RENDER.overrides]])
    expect(recus.at(-1)).toMatchObject({ type: 'rendered', id: RENDER.id })
    expect((recus.at(-1) as { durationMs: number }).durationMs).toBeGreaterThanOrEqual(0)
  })

  it('répond error plutôt que de laisser filer l’exception', () => {
    createPreviewChannel({
      render: () => {
        throw new Error('composant introuvable')
      },
    })

    expect(() => envoie(RENDER)).not.toThrow()
    expect(recus.at(-1)).toMatchObject({
      type: 'error',
      id: RENDER.id,
      message: 'composant introuvable',
    })
    expect((recus.at(-1) as { stack?: string }).stack).toContain('Error')
  })

  it('rend le message d’une exception qui n’est pas une Error', () => {
    createPreviewChannel({
      render: () => {
        throw 'juste une chaîne'
      },
    })

    envoie(RENDER)

    expect(recus.at(-1)).toMatchObject({
      type: 'error',
      message: 'juste une chaîne',
      stack: undefined,
    })
  })
})

describe('ce qui est ignoré', () => {
  function monte() {
    const rendus: unknown[] = []
    const stop = createPreviewChannel({ render: (id) => rendus.push(id) })
    recus.length = 0

    return { rendus, stop }
  }

  it('un message d’une autre origine', () => {
    const { rendus } = monte()

    envoie(RENDER, { origin: AILLEURS })

    expect([rendus, recus]).toEqual([[], []])
  })

  it('un message d’une autre fenêtre que le parent', () => {
    const { rendus } = monte()

    envoie(RENDER, { source: windowAt(ORIGIN) })

    expect([rendus, recus]).toEqual([[], []])
  })

  it('un message d’un type que la preview ne traite pas', () => {
    const { rendus } = monte()

    envoie({ type: 'set-globals', globals: { theme: 'dark' } })
    envoie(undefined)
    envoie({ id: 'sans type' })

    expect([rendus, recus]).toEqual([[], []])
  })

  it('tout, une fois désabonné', () => {
    const { rendus, stop } = monte()

    expect(preview.listenerCount()).toBe(1)
    stop()
    envoie(RENDER)

    expect(preview.listenerCount()).toBe(0)
    expect([rendus, recus]).toEqual([[], []])
  })
})
