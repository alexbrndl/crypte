import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Frame, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, test as base } from 'vitest'
import { startDev } from '../src/dev'
import { storyFilesOf } from '../src/manifest'

// Ce que l'utilisateur voit vraiment, dans un navigateur. Les autres cas
// prouvent que les routes répondent ; ceux-ci prouvent qu'une story s'affiche,
// ce qu'un code HTTP ne dit pas. Voir docs/internal/architecture.md.
//
// Mesuré à l'écriture : les quatre routes répondaient 200 et la page restait
// blanche, le bundle du shell étant en 404.
//
// **Une copie, un serveur et une page par cas.** Partagés, les cas d'édition
// laissaient derrière eux un composant modifié et une story ajoutée, donc les
// cas de lecture ne passaient que dans un ordre précis. L'ordre mélangé l'a
// montré : trois cas sur huit. Le navigateur, lui, reste partagé, parce qu'il ne
// porte aucun état de test.
//
// Sur une copie du projet de démonstration, dans l'espace de travail : hors du
// dépôt, `crypte.config.ts` ne résout plus `@crypte/cli`. La copie garde ses
// liens vers `node_modules`, qui sont relatifs et de même profondeur.

const demo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'demo')

let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch()
}, 180_000)

afterAll(async () => {
  await browser?.close()
})

interface Ecran {
  page: Page
  root: string
  // L'état visible, avec ce que la page a dit : un `#root` vide seul ne dit pas
  // si la preview a échoué, si le shell affiche une erreur, ou si rien n'est
  // encore arrivé. Sans ça, un échec se lit « expected '' to contain … » et ne
  // nomme personne.
  vu: () => Promise<string>
  // Le nombre de fois que le cadre a navigué, pour distinguer une mise à jour à
  // chaud d'un rechargement.
  navigations: () => number
}

const test = base.extend<{ ecran: Ecran }>({
  // Le paramètre vide est la forme que vitest lit pour savoir quelles fixtures
  // initialiser. Le renommer fait collecter zéro test : mesuré. Le lint le
  // signale, et c'est un avertissement assumé.
  ecran: async ({}, use) => {
    const root = mkdtempSync(join(demo, '..', 'tmp-demo-'))
    cpSync(demo, root, { recursive: true })

    const started = await startDev(root)
    await started.server.listen()

    const address = started.server.httpServer?.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')
    const origin = `http://localhost:${address.port}`

    // L'entrée, puis les modules que le navigateur va importer, puis l'attente
    // que l'optimiseur ait fini. Sans les trois, il réécrivait ses paquets
    // pendant que le navigateur chargeait déjà et la page restait sur des URL
    // disparues. Mesuré.
    await fetch(`${origin}/@crypte/preview.js`)
    for (const file of storyFilesOf(started.held.catalogue)) await fetch(`${origin}/${file}`)
    await started.server.waitForRequestsIdle()

    const page = await browser.newPage()
    const plaintes: string[] = []
    let navigations = 0

    page.on('framenavigated', (frame: Frame) => {
      if (frame.url().includes('/preview.html')) navigations += 1
    })
    page.on('console', (message) => {
      if (message.type() === 'error') plaintes.push(`console: ${message.text()}`)
    })
    page.on('pageerror', (error) => plaintes.push(`page: ${error.message}`))

    await page.goto(origin)

    try {
      await use({
        page,
        root,
        navigations: () => navigations,
        vu: async () => {
          const rendu = await page
            .frameLocator('iframe[title="preview"]')
            .locator('#root')
            .textContent()
            .catch(() => '<cadre absent>')

          if (rendu) return rendu

          const etat = await page.locator('main > div > p').last().textContent()

          return `<vide> état: ${etat} ${plaintes.slice(-3).join(' | ')}`
        },
      })
    } finally {
      await page.close()
      await started.server.close()
      rmSync(root, { recursive: true, force: true })
    }
  },
})

// Plus de `retry` : celui d'avant contournait `DCJ-221`, une réoptimisation des
// dépendances dont la preview ne se relevait pas. La cause est corrigée, les
// paquets que la configuration nomme étant pré-empaquetés, et `reopt.test.ts`
// reproduit la course à la demande.
describe('l’écran', () => {
  test('affiche l’arbre des stories', async ({ ecran }) => {
    await expect.poll(() => ecran.page.getByRole('button').count()).toBe(4)
    await expect
      .poll(() => ecran.page.getByRole('heading', { level: 2 }).allTextContents())
      .toEqual(['Badge', 'Boom'])
  })

  // Le rendu se lit dans l'iframe, pas dans la page du shell : c'est là que la
  // preview monte, avec l'adaptateur et le React du projet.
  test('rend la première story dans la preview', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
  })

  test('change de story au clic', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    await ecran.page.getByRole('button', { name: 'Libellé long' }).click()

    await expect.poll(ecran.vu).toBe('Vérification en cours')
  })

  // Une story qui échoue laisse un cadre vide, et un cadre vide sans message
  // ressemble à un outil cassé. L'erreur remonte donc dans l'interface, pas
  // seulement dans une ligne d'état.
  test('montre l’erreur d’une story qui ne rend pas', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    await ecran.page.getByRole('button', { name: 'Échoue au rendu' }).click()

    const alerte = ecran.page.getByRole('alert')
    await expect.poll(() => alerte.isVisible()).toBe(true)
    await expect.poll(() => alerte.textContent()).toContain('ce composant ne rend jamais')

    // Le cadre de la story d'avant ne doit plus être visible : le laisser
    // ferait croire que celle-ci a rendu.
    await expect.poll(() => ecran.page.locator('iframe[title="preview"]').isVisible()).toBe(false)
  })

  // Passé par l'état d'erreur : sans ça, ses deux assertions sont déjà vraies au
  // chargement, donc le cas resterait vert même si le clic ne faisait rien.
  test('revient au rendu quand on retourne sur une story qui marche', async ({ ecran }) => {
    await ecran.page.getByRole('button', { name: 'Échoue au rendu' }).click()
    await expect.poll(() => ecran.page.getByRole('alert').isVisible()).toBe(true)

    await ecran.page.getByRole('button', { name: 'Par défaut' }).click()

    await expect.poll(() => ecran.page.getByRole('alert').count()).toBe(0)
    await expect.poll(ecran.vu).toBe('Nouveau')
  })

  // Ce que React rafraîchit lui-même : le composant est repris par Fast Refresh,
  // pas par le chemin chaud de l'entrée.
  test('rafraîchit la story affichée quand son composant change', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    await ecran.page.getByRole('button', { name: 'Libellé long' }).click()
    await expect.poll(ecran.vu).toBe('Vérification en cours')

    const file = join(ecran.root, 'src', 'components', 'Badge.tsx')
    writeFileSync(file, readFileSync(file, 'utf8').replace('{label}', '{`${label} !`}'))

    const avant = ecran.navigations()

    await expect.poll(ecran.vu).toBe('Vérification en cours !')

    // La story affichée n'a pas changé : c'est tout l'enjeu, un rechargement qui
    // ramène à la première story fait perdre sa place à chaque frappe.
    await expect
      .poll(() =>
        ecran.page.getByRole('button', { name: 'Libellé long' }).getAttribute('aria-current'),
      )
      .toBe('true')

    expect(ecran.navigations()).toBe(avant)
  })

  // Le fichier de story n'exporte aucun composant, donc Fast Refresh ne s'en
  // saisit pas : sans le chemin chaud de l'entrée, Vite ne trouve personne pour
  // accepter et recharge le cadre. Mesuré, c'est ce cas et non le précédent qui
  // éprouve `hot`.
  test('rafraîchit les props d’une story sans recharger le cadre', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    const avant = ecran.navigations()
    const file = join(ecran.root, 'stories', 'Badge.tsx')

    writeFileSync(file, readFileSync(file, 'utf8').replace("'Nouveau'", "'Renouvelé'"))

    await expect.poll(ecran.vu).toContain('Renouvelé')

    expect(ecran.navigations()).toBe(avant)
  })

  // La promesse de la section 2.5, de bout en bout : le `wrap` du projet
  // enveloppe celui du fichier, qui enveloppe le composant. La démonstration
  // déclare `Panel` dans sa configuration et `[[Tone, …]]` dans son fichier.
  test('rend la story dans ses deux enveloppes, la globale à l’extérieur', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    const cadre = ecran.page.frameLocator('iframe[title="preview"]')

    // L'ordre, et pas seulement la présence : le sélecteur enfant direct
    // échouerait si le fichier enveloppait le projet.
    await expect
      .poll(() => cadre.locator('[data-frame="panel"] > [data-frame="tone"]').count())
      .toBe(1)
    await expect
      .poll(() => cadre.locator('[data-frame="tone"]').getAttribute('data-tone'))
      .toBe('calm')
  })

  test('fait apparaître dans l’arbre une story ajoutée', async ({ ecran }) => {
    await expect.poll(() => ecran.page.getByRole('button').count()).toBe(4)

    writeFileSync(
      join(ecran.root, 'stories', 'Tardive.tsx'),
      [
        "import { defineStories } from '@crypte/react'",
        "import { Badge } from '@/components/Badge'",
        '',
        "export default defineStories(Badge, { props: { label: 'Tardive' } })",
      ].join('\n'),
    )

    await expect
      .poll(() => ecran.page.getByRole('heading', { level: 2 }).allTextContents())
      .toContain('Tardive')

    // Et elle rend. L'arbre vient du manifeste, le rendu vient de l'entrée
    // générée : une story visible et immontable est le défaut que l'arbre seul
    // ne montre pas.
    //
    // Depuis une page fraîche : cliquer pendant que la preview se recharge
    // envoie le rendu au document d'avant, qui ne connaît pas encore la story.
    await ecran.page.goto(ecran.page.url())
    await expect.poll(() => ecran.page.getByRole('button', { name: 'Default' }).count()).toBe(1)

    await ecran.page.getByRole('button', { name: 'Default' }).click()

    await expect.poll(ecran.vu).toContain('Tardive')
  })
})
