import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { startDev } from '../src/dev'

// La réoptimisation des dépendances en cours de session, reproduite à la demande.
// Sans le pré-empaquetage des paquets que la configuration nomme, le navigateur
// assemblait quatre générations de paquets et la preview restait vide pour
// toujours, rechargement compris. Voir docs/internal/architecture.md.

const demo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'demo')

let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch()
}, 180_000)

afterAll(async () => {
  await browser?.close()
})

describe('une dépendance découverte pendant le chargement', () => {
  test('laisse la preview repartir seule', async () => {
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
      // Sans préchauffage, et la story neuve écrite pendant que la page charge :
      // c'est la course qui déclenche la réoptimisation. Attendre le rendu
      // d'abord la déclenche aussi, mais Vite s'en relève seul, mesuré.
      void page.goto(`http://localhost:${address.port}`)
      await new Promise((resolve) => setTimeout(resolve, 400))

      writeFileSync(
        join(root, 'stories', 'Tardive.tsx'),
        [
          "import { defineStories } from '@crypte/react'",
          "import { renderToStaticMarkup } from 'react-dom/server'",
          "import { Badge } from '@/components/Badge'",
          '',
          'void renderToStaticMarkup',
          "export default defineStories(Badge, { props: { label: 'Tardive' } })",
        ].join('\n'),
      )

      const vu = async () =>
        page
          .frameLocator('iframe[title="preview"]')
          .locator('#root')
          .textContent()
          .catch(() => '<cadre absent>')

      await expect.poll(vu, { timeout: 30_000 }).toBe('Nouveau')

      // Et rien n'a été avalé : l'export manquant est le symptôme exact.
      expect(plaintes.filter((une) => une.includes('does not provide an export'))).toEqual([])
    } finally {
      await page.close()
      await started.server.close()
      rmSync(root, { recursive: true, force: true })
    }
  }, 120_000)
})
