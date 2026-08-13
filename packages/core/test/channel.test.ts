// Les deux côtés branchés l'un sur l'autre. Le reste des tests forge une
// direction à la fois ; ici, personne ne forge rien.

import { afterEach, expect, it } from 'vitest'
import { PROTOCOL_VERSION } from '../src/protocol/channel'
import { createPreviewChannel } from '../src/preview/index'
import { createShellChannel } from '../src/ui/index'
import { windowAt } from './fake-window'

const ORIGIN = 'https://crypte.test'

const global = globalThis as unknown as { window?: unknown }

afterEach(() => {
  delete global.window
})

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

it('un aller-retour complet, sans message forgé', () => {
  const rendus: unknown[] = []
  const { canal, recus } = branche((id, overrides) => rendus.push([id, overrides]))

  expect(recus).toEqual([{ type: 'ready', protocolVersion: PROTOCOL_VERSION }])

  canal.send({ type: 'render', id: 'badge--par-defaut', overrides: { label: 'Neuf' } })

  expect(rendus).toEqual([['badge--par-defaut', { label: 'Neuf' }]])
  expect(recus.at(-1)).toMatchObject({ type: 'rendered', id: 'badge--par-defaut' })
})

it('une exception du composant revient jusqu’au shell', () => {
  const { canal, recus } = branche(() => {
    throw new Error('composant introuvable')
  })

  canal.send({ type: 'render', id: 'badge--casse', overrides: {} })

  expect(recus.at(-1)).toMatchObject({
    type: 'error',
    id: 'badge--casse',
    message: 'composant introuvable',
  })
})

// La promesse du canal : ni composant, ni instance, ni noeud DOM ne traverse.
// C'est `postMessage` qui la tient, en clonant.
it('refuse de transporter ce qui n’est pas sérialisable', () => {
  const { canal } = branche(() => {})

  expect(() =>
    canal.send({ type: 'render', id: 'badge--par-defaut', overrides: { onClick: () => {} } }),
  ).toThrow()
})

// Ce que la preview lit dans `window` doit être sa fenêtre, pas celle du shell.
// Sans cette bascule, les deux canaux liraient le même `parent` et la même
// origine, et l'appariement des deux côtés serait vrai par accident.
it('chaque côté lit sa propre fenêtre pendant la distribution', () => {
  const vues: unknown[] = []
  const { shell, preview, canal } = branche(() => vues.push(global.window))

  canal.send({ type: 'render', id: 'badge--par-defaut', overrides: {} })

  expect(vues).toEqual([preview])
  expect(global.window).toBe(shell)
})
