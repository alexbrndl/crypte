import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PreviewMessage } from '../src/protocol/channel'
import { createShellChannel } from '../src/ui/index'
import { collect, windowAt } from './fake-window'

const ORIGIN = 'https://crypte.test'
const AILLEURS = 'https://ailleurs.test'

const global = globalThis as unknown as { window?: unknown }

let shell = windowAt(ORIGIN)
let dedans = windowAt(ORIGIN)
let frame = { contentWindow: dedans } as unknown as HTMLIFrameElement

beforeEach(() => {
  shell = windowAt(ORIGIN)
  dedans = windowAt(ORIGIN)
  dedans.sender = shell
  frame = { contentWindow: dedans } as unknown as HTMLIFrameElement
  global.window = shell
})

afterEach(() => {
  delete global.window
})

const RENDER = { type: 'render', id: 'badge--par-defaut', overrides: {} } as const
const READY = { type: 'ready', protocolVersion: 1 } as const

describe('envoi vers la preview', () => {
  it('livre le message dans l’iframe', () => {
    const recus = collect(dedans)

    createShellChannel(frame).send({ ...RENDER })

    expect(recus).toEqual([RENDER])
  })

  it('ne livre rien à une iframe d’une autre origine', () => {
    const etrangere = windowAt(AILLEURS)
    etrangere.sender = shell
    const recus = collect(etrangere)

    createShellChannel({ contentWindow: etrangere } as unknown as HTMLIFrameElement).send({
      ...RENDER,
    })

    expect(recus).toEqual([])
  })

  it('ne tombe pas quand l’iframe n’est pas chargée', () => {
    const vide = { contentWindow: null } as unknown as HTMLIFrameElement

    expect(() => createShellChannel(vide).send({ ...RENDER })).not.toThrow()
  })
})

describe('réception depuis la preview', () => {
  function ecoute() {
    const recus: PreviewMessage[] = []
    const stop = createShellChannel(frame).onMessage((message) => recus.push(message))

    return { recus, stop }
  }

  it('reçoit un message de la preview', () => {
    const { recus } = ecoute()

    shell.deliver({ data: READY, origin: ORIGIN, source: dedans }, ORIGIN)

    expect(recus).toEqual([READY])
  })

  it('ignore un message d’une autre origine', () => {
    const { recus } = ecoute()

    shell.deliver({ data: READY, origin: AILLEURS, source: dedans }, ORIGIN)

    expect(recus).toEqual([])
  })

  it('ignore un message d’une autre fenêtre', () => {
    const { recus } = ecoute()
    const intruse = windowAt(ORIGIN)

    shell.deliver({ data: READY, origin: ORIGIN, source: intruse }, ORIGIN)

    expect(recus).toEqual([])
  })

  it('se désabonne', () => {
    const { recus, stop } = ecoute()

    expect(shell.listenerCount()).toBe(1)
    stop()
    shell.deliver({ data: READY, origin: ORIGIN, source: dedans }, ORIGIN)

    expect(shell.listenerCount()).toBe(0)
    expect(recus).toEqual([])
  })
})
