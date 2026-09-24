import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, type PreviewMessage } from '../src/protocol/channel'
import { createPreviewChannel } from '../src/preview/index'
import { createShellChannel } from '../src/shell/index'
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

describe('sending to the preview', () => {
  it('delivers nothing to an iframe from another origin', () => {
    const etrangere = windowAt(AILLEURS)
    etrangere.sender = shell
    const recus = collect(etrangere)

    createShellChannel({ contentWindow: etrangere } as unknown as HTMLIFrameElement).send({
      ...RENDER,
    })

    expect(recus).toEqual([])
  })
})

describe('receiving from the preview', () => {
  function ecoute() {
    const recus: PreviewMessage[] = []
    const stop = createShellChannel(frame).onMessage((message) => recus.push(message))

    return { recus, stop }
  }

  it('ignores a message from another origin', () => {
    const { recus } = ecoute()

    shell.deliver({ data: READY, origin: AILLEURS, source: dedans }, ORIGIN)

    expect(recus).toEqual([])
  })

  it('ignores a message from another window', () => {
    const { recus } = ecoute()
    const intruse = windowAt(ORIGIN)

    shell.deliver({ data: READY, origin: ORIGIN, source: intruse }, ORIGIN)

    expect(recus).toEqual([])
  })

  it('unsubscribes', () => {
    const { recus, stop } = ecoute()

    expect(shell.listenerCount()).toBe(1)
    stop()
    shell.deliver({ data: READY, origin: ORIGIN, source: dedans }, ORIGIN)

    expect(shell.listenerCount()).toBe(0)
    expect(recus).toEqual([])
  })
})

// Les deux côtés branchés l'un sur l'autre. Le reste des cas forge une direction
// à la fois ; ici, personne ne forge rien.

// Monte les deux canaux, chacun dans son contexte. `window` désigne le shell au
// retour, comme dans le document qui pilote ; la simulation le bascule d'elle-
// même vers la fenêtre qui reçoit, le temps de chaque distribution.
function branche(render: (id: string, overrides: Record<string, unknown>) => void) {
  const shell = windowAt(ORIGIN)
  const preview = windowAt(ORIGIN)

  preview.parent = shell
  preview.sender = shell
  shell.sender = preview

  const recus: unknown[] = []

  // Le shell d'abord, comme dans un navigateur : il pose l'iframe, qui se
  // charge ensuite et annonce `ready`. L'ordre inverse perdrait l'annonce.
  global.window = shell
  const canal = createShellChannel({ contentWindow: preview } as unknown as HTMLIFrameElement)
  const stop = canal.onMessage((message) => recus.push(message))

  global.window = preview
  createPreviewChannel({ render })
  global.window = shell

  return { shell, preview, canal, recus, stop }
}

describe('the round trip between both sides', () => {
  it('a full round trip, without a forged message', () => {
    const rendus: unknown[] = []
    const { canal, recus } = branche((id, overrides) => rendus.push([id, overrides]))

    expect(recus).toEqual([{ type: 'ready', protocolVersion: PROTOCOL_VERSION }])

    canal.send({ type: 'render', id: 'badge--par-defaut', overrides: { label: 'Neuf' } })

    expect(rendus).toEqual([['badge--par-defaut', { label: 'Neuf' }]])
    expect(recus.at(-1)).toMatchObject({ type: 'rendered', id: 'badge--par-defaut' })
  })

  // Ce que la preview lit dans `window` doit être sa fenêtre, pas celle du shell.
  // Sans cette bascule, les deux canaux liraient le même `parent` et la même
  // origine, et l'appariement des deux côtés serait vrai par accident.
  it('each side reads its own window during dispatch', () => {
    const vues: unknown[] = []
    const { shell, preview, canal } = branche(() => vues.push(global.window))

    canal.send({ type: 'render', id: 'badge--par-defaut', overrides: {} })

    expect(vues).toEqual([preview])
    expect(global.window).toBe(shell)
  })
})
