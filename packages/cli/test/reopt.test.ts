import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
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
// La condition est un optimiseur **froid**, et le cas l'affirme au lieu de la
// supposer : `cpSync` emporte `node_modules`, donc le cache d'optimisation de la
// démonstration, qu'un `crypte dev` lancé à la main y a peut-être laissé. Sans ce
// retrait, la condition dépend de l'état d'une copie de travail.

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

    // Le cache hérité s'en va, et son absence est affirmée : c'est la condition
    // du cas, pas un détail de mise en place.
    rmSync(join(root, 'node_modules', '.crypte'), { recursive: true, force: true })
    expect(existsSync(join(root, 'node_modules', '.crypte', 'deps'))).toBe(false)

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

      // Bavard comme celui de `screen.test.ts` : un `#root` vide seul ne nomme
      // personne, et le rouge de ce cas est le seul signal de cette panne.
      const vu = async () => {
        const rendu = await page
          .frameLocator('iframe[title="preview"]')
          .locator('#root')
          .textContent()
          .catch(() => '<cadre absent>')

        if (rendu) return rendu

        return `<vide> ${plaintes.slice(-2).join(' | ')}`
      }

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
