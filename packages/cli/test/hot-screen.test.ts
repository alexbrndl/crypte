import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Frame, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startDev, type Started } from '../src/dev'

// Ce que l'utilisateur voit quand il édite, dans un navigateur. Les cas de
// `hot.test.ts` prouvent que le catalogue suit ; ceux-ci prouvent que l'écran
// suit, ce qu'aucune requête ne dit.
//
// Sur une copie du projet de démonstration, dans l'espace de travail : ces cas
// écrivent des fichiers, et le projet est commité. La copie garde ses liens vers
// `node_modules`, qui sont relatifs et de même profondeur.

const demo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'demo')

describe('l’écran pendant qu’on édite', () => {
  let started: Started
  let browser: Browser
  let page: Page
  let origin: string
  let root: string
  let navigations = 0

  beforeAll(async () => {
    root = mkdtempSync(join(demo, '..', 'tmp-demo-'))
    cpSync(demo, root, { recursive: true })

    started = await startDev(root)
    await started.server.listen()

    const address = started.server.httpServer?.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')
    origin = `http://localhost:${address.port}`

    await fetch(`${origin}/@crypte/preview.js`)

    browser = await chromium.launch()
    page = await browser.newPage()

    // Ce qui distingue une mise à jour à chaud d'un rechargement : sans ce
    // compte, les deux passent le cas ci-dessous, puisque le shell redemande sa
    // story dès que la preview redit `ready`.
    page.on('framenavigated', (frame: Frame) => {
      if (frame.url().includes('/preview.html')) navigations += 1
    })
  }, 180_000)

  afterAll(async () => {
    await browser?.close()
    await started?.server.close()
    if (root) rmSync(root, { recursive: true, force: true })
  })

  // Le cas de fin du lot. Sans le chemin chaud de l'entrée, Vite ne trouve
  // personne pour accepter la mise à jour et recharge la page : la story revient
  // parce que le shell la redemande, mais tout est remonté pour rien.
  it('rafraîchit la story affichée quand son composant change', async () => {
    await page.goto(origin)

    const preview = page.frameLocator('iframe[title="preview"]')
    await expect
      .poll(() => preview.locator('#root').textContent(), { timeout: 30_000 })
      .toBe('Nouveau')

    await page.getByRole('button', { name: 'Libellé long' }).click()
    await expect.poll(() => preview.locator('#root').textContent()).toBe('Vérification en cours')

    const file = join(root, 'src', 'components', 'Badge.tsx')
    writeFileSync(file, readFileSync(file, 'utf8').replace('{label}', '{`${label} !`}'))

    const before = navigations

    await expect
      .poll(() => preview.locator('#root').textContent(), { timeout: 30_000 })
      .toBe('Vérification en cours !')

    // La story affichée n'a pas changé : c'est tout l'enjeu, un rechargement qui
    // ramène à la première story fait perdre sa place à chaque frappe.
    await expect
      .poll(() => page.getByRole('button', { name: 'Libellé long' }).getAttribute('aria-current'))
      .toBe('true')

    // Et le cadre n'a pas rechargé. Sans cette ligne le cas passerait aussi
    // avec un rechargement complet, donc il ne prouverait pas le chemin chaud.
    expect(navigations).toBe(before)
  }, 90_000)

  // Le fichier de story n'exporte aucun composant, donc Fast Refresh ne s'en
  // saisit pas : sans le chemin chaud de l'entrée, Vite ne trouve personne pour
  // accepter et recharge le cadre. Mesuré, c'est ce cas et non le précédent qui
  // éprouve `hot`.
  it('rafraîchit les props d’une story sans recharger le cadre', async () => {
    await page.goto(origin)

    // `toContain` : le cas précédent a modifié le composant de cette copie, et
    // ce qu'il rend porte donc sa marque.
    const preview = page.frameLocator('iframe[title="preview"]')
    await expect
      .poll(() => preview.locator('#root').textContent(), { timeout: 30_000 })
      .toContain('Nouveau')

    const before = navigations
    const file = join(root, 'stories', 'Badge.tsx')
    writeFileSync(file, readFileSync(file, 'utf8').replace("'Nouveau'", "'Renouvelé'"))

    await expect
      .poll(() => preview.locator('#root').textContent(), { timeout: 30_000 })
      .toContain('Renouvelé')

    expect(navigations).toBe(before)
  }, 90_000)

  it('fait apparaître dans l’arbre une story ajoutée', async () => {
    await page.goto(origin)
    await expect.poll(() => page.getByRole('button').count(), { timeout: 30_000 }).toBe(4)

    writeFileSync(
      join(root, 'stories', 'Tardive.tsx'),
      [
        "import { defineStories } from '@crypte/react'",
        "import { Badge } from '@/components/Badge'",
        '',
        "export default defineStories(Badge, { props: { label: 'Tardive' } })",
      ].join('\n'),
    )

    await expect
      .poll(() => page.getByRole('heading', { level: 2 }).allTextContents(), { timeout: 30_000 })
      .toContain('Tardive')
  }, 90_000)
})
