import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { startDev } from '../src/dev'

// La réoptimisation des dépendances pendant le premier chargement, reproduite à la
// demande. Ce qu'il fallait pour la voir : **ne pas préchauffer**. L'optimiseur
// découvre alors les dépendances du paquet lié pendant que la page charge, et
// réécrit ses paquets sous elle.
//
// Sans le pré-empaquetage, le navigateur assemblait quatre générations de paquets,
// signalait un export `t` manquant, et `#root` restait vide pour toujours,
// rechargement compris. Voir docs/internal/architecture.md.
//
// Une copie du projet de démonstration : son dossier `.crypte` est vide dans le
// dépôt, donc chaque copie repart d'un optimiseur froid, ce qui est la condition.

const demo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'demo')

let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch()
}, 180_000)

afterAll(async () => {
  await browser?.close()
})

describe('un optimiseur froid au premier chargement', () => {
  test('laisse la preview rendre, sans mélanger deux générations de paquets', async () => {
    const root = mkdtempSync(join(demo, '..', 'tmp-demo-'))
    cpSync(demo, root, { recursive: true })

    const started = await startDev(root, () => {})
    await started.server.listen()
    const address = started.server.httpServer?.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')

    const page = await browser.newPage()
    const plaintes: string[] = []
    page.on('pageerror', (error) => plaintes.push(error.message))

    try {
      // Aucun préchauffage, contrairement à `screen.test.ts` : c'est lui qui
      // masquait la panne, et le `retry` qui la contournait.
      await page.goto(`http://localhost:${address.port}`)

      const vu = async () =>
        page
          .frameLocator('iframe[title="preview"]')
          .locator('#root')
          .textContent()
          .catch(() => '<cadre absent>')

      await expect.poll(vu, { timeout: 30_000 }).toBe('Nouveau')

      // Et rien n'a été avalé : l'export manquant est le symptôme exact, et il
      // survit à un rechargement, donc l'absence de plainte est ce qui compte.
      expect(plaintes.filter((une) => une.includes('does not provide an export'))).toEqual([])
    } finally {
      await page.close()
      await started.server.close()
      rmSync(root, { recursive: true, force: true })
    }
  }, 120_000)
})
