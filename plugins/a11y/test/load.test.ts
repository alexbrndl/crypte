import type { PreviewContext } from '@crypte/core/protocol'
import { expect, it } from 'vitest'
import hooks from '../src/preview'

// Seul dans son fichier : les cas d'un fichier sont mélangés, et chacun des
// autres charge axe. Un fichier a son propre jsdom.

// Importé avec le module, axe retardait la première story de 400 ms : la
// preview attend le module de chaque plugin avant de la rendre.
it('loads axe at the first analysis, not with the module', async () => {
  expect(window.axe).toBeUndefined()

  const root = document.createElement('div')
  document.body.append(root)
  const ctx: PreviewContext = { id: 'x--defaut', props: {}, options: {}, root, send: () => {} }
  await hooks.afterMount?.(ctx)

  expect(typeof window.axe.run).toBe('function')
})
