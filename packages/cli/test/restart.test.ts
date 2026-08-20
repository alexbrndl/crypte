import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { dev } from '../src/dev'
import { MANIFEST_ROUTE } from '../src/serve'

// Éditer `crypte.config.ts` remet les deux pages en marche sans commande.
// `server.restart()` de Vite ne suffit pas : notre configuration est lue par
// `loadProject`, hors de Vite, et le plugin de service capture le projet.
// `DCJ-220`.
//
// Ces cas passent par `dev()`, donc par le port par défaut : ils vivent dans le
// projet `écran`, le seul qui tourne un fichier à la fois.

const ici = dirname(fileURLToPath(import.meta.url))
const fixture = join(ici, 'fixture')
const demo = join(ici, '..', '..', '..', 'apps', 'demo')

let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch()
}, 180_000)

afterAll(async () => {
  await browser?.close()
})

const copie = (source: string, dans: string) => {
  const root = mkdtempSync(join(source, '..', dans))
  cpSync(source, root, { recursive: true })

  return root
}

const compteSur = (port: number) => async () => {
  const manifest = (await fetch(`http://localhost:${port}${MANIFEST_ROUTE}`).then((answer) =>
    answer.json(),
  )) as { entries: unknown[] }

  return manifest.entries.length
}

describe('la configuration relue sans commande', () => {
  test('reprend le même port et sert le catalogue neuf', { timeout: 120_000 }, async () => {
    const root = copie(fixture, 'tmp-hot-')
    const config = join(root, 'crypte.config.ts')
    const avant = readFileSync(config, 'utf8')

    const dites: string[] = []
    const running = await dev(root, (une: string) => dites.push(une))
    const address = running.server.httpServer?.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')

    const compte = compteSur(address.port)

    try {
      expect(await compte()).toBe(4)

      // Le dossier des stories se réduit : tout l'arbre change, ce qui est le cas
      // que `recovered` doit encaisser côté shell.
      writeFileSync(config, avant.replace("stories: 'stories'", "stories: 'stories/checkout'"))

      // Le même port, ce qui est ce qui permet au navigateur de se reconnecter
      // sans que personne ne touche à rien.
      await expect.poll(compte, { timeout: 30_000 }).toBe(3)
      expect(dites.filter((une) => une.includes('changed'))).toHaveLength(1)
    } finally {
      await running.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  test(
    'garde le serveur debout sur une configuration illisible',
    { timeout: 120_000 },
    async () => {
      const root = copie(fixture, 'tmp-hot-')
      const config = join(root, 'crypte.config.ts')
      const avant = readFileSync(config, 'utf8')

      const dites: string[] = []
      const running = await dev(root, (une: string) => dites.push(une))
      const address = running.server.httpServer?.address()
      if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')

      const compte = compteSur(address.port)

      try {
        writeFileSync(config, 'export default {')

        await expect
          .poll(() => dites.filter((une) => une.includes('could not be read')).length, {
            timeout: 30_000,
          })
          .toBe(1)

        // Debout, et sur le catalogue d'avant : un fichier à moitié écrit est un
        // état ordinaire de la frappe.
        expect(await compte()).toBe(4)

        // Le même échec ne se dit qu'une fois : pendant une conversion, chaque
        // sauvegarde échoue de la même façon et la répétition enterre la ligne
        // qui suit. Un contenu différent, donc un échec différent, se dit.
        writeFileSync(config, 'export default { ')
        await expect
          .poll(() => dites.filter((une) => une.includes('could not be read')).length, {
            timeout: 30_000,
          })
          .toBe(2)

        writeFileSync(config, 'export default { ')
        await new Promise((resolve) => setTimeout(resolve, 500))

        expect(dites.filter((une) => une.includes('could not be read'))).toHaveLength(2)

        // Et il repart quand le fichier redevient lisible.
        writeFileSync(config, avant.replace("stories: 'stories'", "stories: 'stories/checkout'"))
        await expect.poll(compte, { timeout: 30_000 }).toBe(3)
      } finally {
        await running.close()
        rmSync(root, { recursive: true, force: true })
      }
    },
  )

  // L'exemple de l'issue : changer l'entrée CSS. Rien n'en paraît dans l'arbre,
  // donc c'est l'entrée servie qui le dit, et elle ne peut pas l'apprendre sans
  // que `loadProject` soit repassé.
  test('sert une entrée CSS neuve après le changement', { timeout: 120_000 }, async () => {
    const root = copie(fixture, 'tmp-hot-')
    const config = join(root, 'crypte.config.ts')
    const avant = readFileSync(config, 'utf8')
    writeFileSync(join(root, 'src', 'styles', 'autre.css'), ':root { --crypte-essai: 1; }\n')

    const running = await dev(root, () => {})
    const address = running.server.httpServer?.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')

    const entrée = async () =>
      await fetch(`http://localhost:${address.port}/@crypte/preview.js`).then((answer) =>
        answer.text(),
      )

    try {
      expect(await entrée()).toContain('styles/app.css')

      writeFileSync(
        config,
        avant.replace("css: 'src/styles/app.css'", "css: 'src/styles/autre.css'"),
      )

      await expect.poll(entrée, { timeout: 30_000 }).toContain('styles/autre.css')
    } finally {
      await running.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  // Le critère de fin de l'issue : sur la démonstration, une story affichée, et
  // changer la configuration remet les deux pages en marche sans commande.
  //
  // Deux versions de ce cas étaient fausses avant celle-ci, mesurées. La
  // première affirmait que la story rendait encore après le changement, vrai
  // d'une page qui n'est jamais repartie : elle passait avec le redémarrage
  // débranché. La seconde attendait un rechargement de la page du haut, qui
  // n'arrive pas : le shell est un bundle préconstruit, donc sans client HMR.
  //
  // Le mécanisme réel est celui sur lequel l'issue compte : l'iframe, elle, est
  // transformée par Vite, donc elle se recharge, dit `ready`, et le shell relit
  // son catalogue à ce moment. C'est l'arbre du shell qui le prouve.
  test('remet les deux pages en marche sans commande', { timeout: 180_000 }, async () => {
    const root = copie(demo, 'tmp-demo-')
    mkdirSync(join(root, 'node_modules', '.crypte', 'deps'), { recursive: true })
    rmSync(join(root, 'node_modules', '.crypte'), { recursive: true, force: true })

    // Un dossier de stories plus petit, pour que le changement se voie.
    mkdirSync(join(root, 'stories', 'seul'), { recursive: true })
    writeFileSync(
      join(root, 'stories', 'seul', 'Seule.tsx'),
      `import { defineStories } from '@crypte/react'
import { Badge } from '@/components/Badge'

export default defineStories(Badge, { props: { label: 'Seule' } })
`,
    )

    const config = join(root, 'crypte.config.ts')
    const avant = readFileSync(config, 'utf8')

    const running = await dev(root, () => {})
    const address = running.server.httpServer?.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')

    const page = await browser.newPage()

    const arbre = () => page.locator('nav button').allTextContents()
    const rendu = () =>
      page
        .frameLocator('iframe[title="preview"]')
        .locator('#root')
        .textContent()
        .catch(() => '<cadre absent>')

    try {
      await page.goto(`http://localhost:${address.port}`)
      await expect.poll(rendu, { timeout: 60_000 }).toBe('Nouveau')

      const départ = await arbre()
      expect(départ.length).toBeGreaterThan(1)

      // Le dossier des stories change : tout l'arbre en dépend, et le plugin de
      // service capture le projet, donc c'est bien tout le serveur qui repart.
      writeFileSync(config, avant.replace("stories: 'stories'", "stories: 'stories/seul'"))

      // L'arbre du shell suit, sans commande : la preview s'est rechargée, a dit
      // `ready`, et le shell a relu son catalogue.
      await expect.poll(arbre, { timeout: 60_000 }).toEqual(['Default'])

      // La story affichée a disparu avec son fichier, donc la sélection est vide
      // et dite : `recovered` refuse d'envoyer l'utilisateur sur un composant
      // qu'il n'a pas ouvert, et l'issue le demande explicitement.
      await expect
        .poll(() => page.locator('main > div > p').last().textContent(), { timeout: 30_000 })
        .toBe('la story affichée a disparu')

      // Et l'outil marche : la story qui reste rend au clic.
      await page.getByRole('button', { name: 'Default', exact: true }).click()
      await expect.poll(rendu, { timeout: 60_000 }).toBe('Seule')
    } finally {
      await page.close()
      await running.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
