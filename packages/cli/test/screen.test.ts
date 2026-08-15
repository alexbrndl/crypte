import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Frame, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startDev, type Started } from '../src/dev'

// Ce que l'utilisateur voit vraiment, dans un navigateur. Les autres cas
// prouvent que les routes répondent ; ceux-ci prouvent qu'une story s'affiche,
// ce qu'un code HTTP ne dit pas. Voir docs/internal/architecture.md.
//
// Mesuré à l'écriture : les quatre routes répondaient 200 et la page restait
// blanche, le bundle du shell étant en 404.
//
// Un seul fichier, donc un seul navigateur et un seul serveur : deux fichiers
// navigateur en parallèle se privaient l'un l'autre et les trois cas d'édition
// tombaient ensemble une fois sur deux. Mesuré.
//
// Sur une copie du projet de démonstration, dans l'espace de travail : les cas
// d'édition écrivent des fichiers, et le projet est commité. La copie garde ses
// liens vers `node_modules`, qui sont relatifs et de même profondeur.

const demo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'demo')

describe('l’écran', () => {
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

    // Une fois l'entrée demandée, Vite a transformé et optimisé ce qu'il fallait.
    // Sans ce préchauffage, le premier rendu attend cette optimisation et les cas
    // rougissent pour une raison qui n'est pas la leur. Mesuré, avec un plugin
    // React déclaré par le projet.
    await fetch(`${origin}/@crypte/preview.js`)

    browser = await chromium.launch()
    page = await browser.newPage()

    // Ce qui distingue une mise à jour à chaud d'un rechargement : sans ce
    // compte, les deux passent les cas d'édition, puisque le shell redemande sa
    // story dès que la preview redit `ready`.
    page.on('framenavigated', (frame: Frame) => {
      if (frame.url().includes('/preview.html')) navigations += 1
    })

    // Un premier rendu avant tout cas. Le préchauffage de l'entrée ne couvre pas
    // l'optimisation que Vite fait à la première demande du navigateur, ni le
    // premier montage de React : sous charge, le premier cas payait les trois et
    // rougissait pour une raison qui n'est pas la sienne. Mesuré sous le
    // contrôle de mutation.
    await page.goto(origin)
    await expect
      .poll(() => page.frameLocator('iframe[title="preview"]').locator('#root').textContent(), {
        timeout: 120_000,
      })
      .toBe('Nouveau')
  }, 300_000)

  afterAll(async () => {
    await browser?.close()
    await started?.server.close()
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('affiche l’arbre des stories', async () => {
    await page.goto(origin)

    await expect.poll(() => page.getByRole('button').count(), { timeout: 60_000 }).toBe(4)
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
      .poll(() => preview.locator('#root').textContent(), { timeout: 60_000 })
      .toBe('Nouveau')
  })

  it('change de story au clic', async () => {
    await page.goto(origin)

    const preview = page.frameLocator('iframe[title="preview"]')
    await expect
      .poll(() => preview.locator('#root').textContent(), { timeout: 60_000 })
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
      .poll(() => preview.locator('#root').textContent(), { timeout: 60_000 })
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
    await expect.poll(() => page.getByRole('alert').isVisible(), { timeout: 60_000 }).toBe(true)

    await page.getByRole('button', { name: 'Par défaut' }).click()

    await expect.poll(() => page.getByRole('alert').count(), { timeout: 10_000 }).toBe(0)
    await expect
      .poll(() => page.frameLocator('iframe[title="preview"]').locator('#root').textContent())
      .toBe('Nouveau')
  })

  // Les cas d'édition viennent après, dans cet ordre : chacun laisse la copie
  // modifiée, et les cas ci-dessus attendent le projet tel qu'il est commité.

  // Le cas de fin du lot 5b. Ce que React rafraîchit lui-même, en fait : le
  // composant est repris par Fast Refresh, pas par le chemin chaud de l'entrée.
  it('rafraîchit la story affichée quand son composant change', async () => {
    await page.goto(origin)

    const preview = page.frameLocator('iframe[title="preview"]')
    await expect
      .poll(() => preview.locator('#root').textContent(), { timeout: 60_000 })
      .toBe('Nouveau')

    await page.getByRole('button', { name: 'Libellé long' }).click()
    await expect.poll(() => preview.locator('#root').textContent()).toBe('Vérification en cours')

    const file = join(root, 'src', 'components', 'Badge.tsx')
    writeFileSync(file, readFileSync(file, 'utf8').replace('{label}', '{`${label} !`}'))

    const before = navigations

    await expect
      .poll(() => preview.locator('#root').textContent(), { timeout: 60_000 })
      .toBe('Vérification en cours !')

    // La story affichée n'a pas changé : c'est tout l'enjeu, un rechargement qui
    // ramène à la première story fait perdre sa place à chaque frappe.
    await expect
      .poll(() => page.getByRole('button', { name: 'Libellé long' }).getAttribute('aria-current'))
      .toBe('true')

    expect(navigations).toBe(before)
  }, 180_000)

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
      .poll(() => preview.locator('#root').textContent(), { timeout: 60_000 })
      .toContain('Nouveau')

    const before = navigations
    const file = join(root, 'stories', 'Badge.tsx')
    writeFileSync(file, readFileSync(file, 'utf8').replace("'Nouveau'", "'Renouvelé'"))

    await expect
      .poll(() => preview.locator('#root').textContent(), { timeout: 60_000 })
      .toContain('Renouvelé')

    expect(navigations).toBe(before)
  }, 180_000)

  it('fait apparaître dans l’arbre une story ajoutée', async () => {
    await page.goto(origin)
    await expect.poll(() => page.getByRole('button').count(), { timeout: 60_000 }).toBe(4)

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
      .poll(() => page.getByRole('heading', { level: 2 }).allTextContents(), { timeout: 60_000 })
      .toContain('Tardive')

    // Et elle rend. L'arbre vient du manifeste, le rendu vient de l'entrée
    // générée : une story visible et immontable est le défaut que l'arbre seul
    // ne montre pas.
    //
    // Depuis une page fraîche : cliquer pendant que la preview se recharge
    // envoie le rendu au document d'avant, qui ne connaît pas encore la story.
    // Mesuré. La page fraîche éprouve la même chose, l'entrée étant regénérée.
    await page.goto(origin)
    await expect
      .poll(() => page.getByRole('button', { name: 'Default' }).count(), { timeout: 60_000 })
      .toBe(1)

    await page.getByRole('button', { name: 'Default' }).click()

    await expect
      .poll(() => page.frameLocator('iframe[title="preview"]').locator('#root').textContent(), {
        timeout: 60_000,
      })
      .toContain('Tardive')
  }, 180_000)
})
