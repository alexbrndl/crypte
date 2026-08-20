import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { startDev } from '../src/dev'

// Le critère de fin de `DCJ-217`, dans un vrai navigateur : un fichier dont une
// clé de story est calculée, un autre dont un bloc de props porte un spread.
// L'utilisateur voit une erreur pour le premier sans la chercher, une note
// discrète pour le second, et ni l'un ni l'autre ne l'empêche de travailler.

const demo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'demo')

let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch()
}, 180_000)

afterAll(async () => {
  await browser?.close()
})

describe('ce que le catalogue a laissé de côté, à l’écran', () => {
  test('se voit sans empêcher de travailler', { timeout: 120_000 }, async () => {
    const root = mkdtempSync(join(demo, '..', 'tmp-demo-'))
    cpSync(demo, root, { recursive: true })

    // Comme les autres cas navigateur : le cache hérité fait réoptimiser sous la
    // page, ce qui est `DCJ-221`, et l'accusation tomberait sur ce lot.
    mkdirSync(join(root, 'node_modules', '.crypte', 'deps'), { recursive: true })
    rmSync(join(root, 'node_modules', '.crypte'), { recursive: true, force: true })
    expect(existsSync(join(root, 'node_modules', '.crypte', 'deps'))).toBe(false)

    // Une clé de story calculée : le fichier rend une story et en perd une.
    writeFileSync(
      join(root, 'stories', 'Calculee.tsx'),
      `import { defineStories } from '@crypte/react'
import { Badge } from '@/components/Badge'

const nom = 'Calculée'

export default defineStories(Badge, {
  props: { label: 'Lue' },
  stories: { Lue: {}, [nom]: { label: 'Perdue' } },
})
`,
    )

    // Un spread dans un bloc de props : la story rend, sa fiche est partielle.
    writeFileSync(
      join(root, 'stories', 'Partielle.tsx'),
      `import { defineStories } from '@crypte/react'
import { Badge } from '@/components/Badge'

const base = { label: 'Partielle' }

export default defineStories(Badge, {
  stories: { Un: { ...base, tone: 'calm' } },
})
`,
    )

    const started = await startDev(root, () => {})
    await started.server.listen()
    const address = started.server.httpServer?.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')

    const page = await browser.newPage()

    try {
      await page.goto(`http://localhost:${address.port}`)

      // L'erreur, visible sans la chercher, et qui dit ce que le fichier a
      // quand même donné.
      const écartés = page.locator('.set-aside li')
      await expect.poll(() => écartés.count(), { timeout: 30_000 }).toBe(1)
      expect(await écartés.first().textContent()).toContain('stories/Calculee.tsx')
      expect(await écartés.first().textContent()).toContain('1 story lue, il en manque')

      // Rien n'empêche de travailler : la story lue du même fichier est là et
      // rend, ce qui est la moitié qu'un message ne doit pas coûter.
      await page.getByRole('button', { name: 'Lue', exact: true }).click()
      await expect
        .poll(() => page.frameLocator('iframe[title="preview"]').locator('#root').textContent(), {
          timeout: 30_000,
        })
        .toBe('Lue')

      // La note discrète, sur la story dont la fiche est partielle.
      await page.getByRole('button', { name: 'Un', exact: true }).click()
      await expect
        .poll(() => page.locator('.partial').textContent(), { timeout: 30_000 })
        .toContain('`...base`')
    } finally {
      await page.close()
      await started.server.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
