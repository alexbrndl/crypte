import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startDev, type Started } from '../src/dev'

// Ce que l'utilisateur voit vraiment, dans un navigateur. Les autres cas
// prouvent que les routes répondent ; celui-ci prouve qu'une story s'affiche,
// ce qu'un code HTTP ne dit pas. Voir docs/internal/architecture.md.
//
// Mesuré à l'écriture : les quatre routes répondaient 200 et la page restait
// blanche, le bundle du shell étant en 404.

const demo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'demo')

describe('l’écran', () => {
  let started: Started
  let browser: Browser
  let page: Page
  let origin: string

  beforeAll(async () => {
    started = await startDev(demo)
    await started.server.listen()

    const address = started.server.httpServer?.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')
    origin = `http://localhost:${address.port}`

    // Une fois l'entrée demandée, Vite a transformé et optimisé ce qu'il fallait.
    // Sans ce préchauffage, le premier rendu attend cette optimisation et les cas
    // rougissent pour une raison qui n'est pas la leur. Mesuré, avec un plugin
    // React déclaré par le projet.
    await fetch(`${origin}/@crypte/preview.js`)

    browser = await chromium.launch()
    page = await browser.newPage()
  }, 180_000)

  afterAll(async () => {
    await browser?.close()
    await started?.server.close()
  })

  it('affiche l’arbre des stories', async () => {
    await page.goto(origin)

    await expect.poll(() => page.getByRole('button').count(), { timeout: 20_000 }).toBe(4)
    await expect
      .poll(() => page.getByRole('heading', { level: 2 }).allTextContents())
      .toEqual(['Badge', 'Boom'])
  })

  // Le rendu se lit dans l'iframe, pas dans la page du shell : c'est là que la
  // preview monte, avec l'adaptateur et le React du projet.
  it('rend la première story dans la preview', async () => {
    await page.goto(origin)

    const preview = page.frameLocator('iframe[title="preview"]')

    await expect
      .poll(() => preview.locator('#root').textContent(), { timeout: 20_000 })
      .toBe('Nouveau')
  })

  it('change de story au clic', async () => {
    await page.goto(origin)

    const preview = page.frameLocator('iframe[title="preview"]')
    await expect
      .poll(() => preview.locator('#root').textContent(), { timeout: 20_000 })
      .toBe('Nouveau')

    await page.getByRole('button', { name: 'Libellé long' }).click()

    await expect.poll(() => preview.locator('#root').textContent()).toBe('Vérification en cours')
  })

  // Une story qui échoue laisse un cadre vide, et un cadre vide sans message
  // ressemble à un outil cassé. L'erreur remonte donc dans l'interface, pas
  // seulement dans une ligne d'état.
  it('montre l’erreur d’une story qui ne rend pas', async () => {
    await page.goto(origin)

    const preview = page.frameLocator('iframe[title="preview"]')
    await expect
      .poll(() => preview.locator('#root').textContent(), { timeout: 20_000 })
      .toBe('Nouveau')

    await page.getByRole('button', { name: 'Échoue au rendu' }).click()

    const alert = page.getByRole('alert')
    await expect.poll(() => alert.isVisible(), { timeout: 10_000 }).toBe(true)
    await expect.poll(() => alert.textContent()).toContain('ce composant ne rend jamais')

    // Le cadre de la story d'avant ne doit plus être visible : le laisser
    // ferait croire que celle-ci a rendu.
    await expect.poll(() => page.locator('iframe[title="preview"]').isVisible()).toBe(false)
  })

  // Reparti d'une page fraîche et passé par l'état d'erreur : sans ça, ses deux
  // assertions sont déjà vraies au chargement, donc le cas resterait vert même
  // si le clic ne faisait rien.
  it('revient au rendu quand on retourne sur une story qui marche', async () => {
    await page.goto(origin)

    await page.getByRole('button', { name: 'Échoue au rendu' }).click()
    await expect.poll(() => page.getByRole('alert').isVisible(), { timeout: 20_000 }).toBe(true)

    await page.getByRole('button', { name: 'Par défaut' }).click()

    await expect.poll(() => page.getByRole('alert').count(), { timeout: 10_000 }).toBe(0)
    await expect
      .poll(() => page.frameLocator('iframe[title="preview"]').locator('#root').textContent())
      .toBe('Nouveau')
  })
})
