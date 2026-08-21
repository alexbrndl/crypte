import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Frame } from 'playwright'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { startDev } from '../src/dev'
import { storyFilesOf } from '../src/manifest'
import { PREVIEW_ENTRY } from '../src/serve'

// Ce que les plugins du projet font, et ce qu'ils ne sont pas obligés de faire.
// Vite transforme le JSX par oxc, donc `@vitejs/plugin-react` n'est pas
// nécessaire au rendu ; déclaré, il porte React Compiler jusqu'au module servi.
// `DCJ-170`.

const demo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'demo')

let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch()
}, 180_000)

afterAll(async () => {
  await browser?.close()
})

describe('une configuration sans plugin React', () => {
  test('laisse la preview rendre', { timeout: 120_000 }, async () => {
    // Retirée avant la copie, et affirmée : une substitution muette laisserait
    // la configuration complète, donc le cas passerait en mesurant l'inverse de
    // ce qu'il annonce.
    const source = readFileSync(join(demo, 'crypte.config.ts'), 'utf8')
    const nue = source
      .replace("import react from '@vitejs/plugin-react'\n", '')
      .replace("import compiler from 'babel-plugin-react-compiler'\n", '')
      .replace('  vite: { plugins: [react({ babel: { plugins: [compiler] } })] },\n', '')

    expect(nue).not.toContain('@vitejs/plugin-react')
    expect(nue).not.toContain('babel-plugin-react-compiler')
    expect(nue).not.toContain('vite:')
    expect(nue).toContain('adapter: crypte()')

    const root = mkdtempSync(join(demo, '..', 'tmp-demo-'))
    cpSync(demo, root, { recursive: true })
    writeFileSync(join(root, 'crypte.config.ts'), nue)

    // Comme les cinq autres fichiers navigateur, et pour la seule raison de leur
    // ressembler : la racine étant un `mkdtemp` neuf, Vite jette de toute façon
    // un cache hérité, `getConfigHash` incluant la racine. Posé avant d'être
    // retiré, sinon l'affirmation ne surveille que `rmSync`.
    mkdirSync(join(root, 'node_modules', '.crypte', 'deps'), { recursive: true })
    rmSync(join(root, 'node_modules', '.crypte'), { recursive: true, force: true })
    expect(existsSync(join(root, 'node_modules', '.crypte', 'deps'))).toBe(false)

    const started = await startDev(root, () => {})
    await started.server.listen()
    const address = started.server.httpServer?.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')
    const origin = `http://localhost:${address.port}`

    // Le préchauffage de `screen.test.ts` : l'entrée, puis les modules que le
    // navigateur va importer. Il rétrécit la fenêtre de rechargement, il ne la
    // ferme pas : `waitForRequestsIdle` rend la main à la fin du crawl, et
    // l'optimiseur s'abonne à la même promesse, donc `runOptimizer` et son
    // `full-reload` viennent après.
    //
    // Le statut est vérifié : une route qui change de forme répondrait 404 et le
    // préchauffage ne réchaufferait plus rien, sans que rien ne le dise.
    const chauffe = async (chemin: string) => {
      const réponse = await fetch(`${origin}${chemin}`)

      expect(réponse.ok, `préchauffage de ${chemin}`).toBe(true)
    }

    const page = await browser.newPage()
    const plaintes: string[] = []
    let navigations = 0
    page.on('framenavigated', (frame: Frame) => {
      if (frame.url().includes('/preview.html')) navigations += 1
    })
    // La console autant que les erreurs de page : « console vide » est ce que la
    // documentation annonce de ce cas, et `pageerror` seul ne le surveillait pas.
    page.on('console', (message) => {
      if (message.type() === 'error') plaintes.push(`console: ${message.text()}`)
    })
    page.on('pageerror', (error) => plaintes.push(`page: ${error.message}`))

    try {
      // Dans le `try` : une réponse non-2xx est précisément ce que l'affirmation
      // existe pour montrer, et levée au-dessus elle laissait le serveur à
      // l'écoute et la copie sur le disque.
      await chauffe(PREVIEW_ENTRY)
      for (const file of storyFilesOf(started.held.catalogue)) await chauffe(`/${file}`)
      await started.server.waitForRequestsIdle()

      await page.goto(origin)

      const cadre = page.frameLocator('iframe[title="preview"]')

      // Le cadre vide est le symptôme d'une entrée que le navigateur refuse, et
      // c'est sa plainte qui dit la panne.
      const vu = async () => {
        const rendu = await cadre
          .locator('#root')
          .textContent()
          .catch(() => '<cadre absent>')

        if (rendu) return rendu

        return `<vide> ${plaintes.slice(-2).join(' | ')}`
      }

      await expect.poll(vu, { timeout: 30_000 }).toBe('Nouveau')

      // Les enveloppes aussi : elles viennent de la configuration, et c'est le
      // reste du JSX du projet que le plugin absent aurait pu emporter.
      // Le cadre est sondé, `count()` ne réessayant pas : un rechargement qui
      // tombe pendant l'appel rend `0` et l'échec accuserait le plugin absent.
      //
      // `expect.any(Number)` sur les navigations, et non l'absence de la clé :
      // `toMatchObject` retire de l'objet reçu les clés que l'attendu ne nomme
      // pas, donc le compte ne partait dans aucun message. Mesuré, `navigations:
      // 7` était invisible. Nommé sans être fixé, il est imprimé et un
      // rechargement se lit, là où une affirmation dure rendrait rouge un état
      // que `reopt.test.ts` documente comme normal sur un optimiseur froid.
      await expect
        .poll(
          async () => ({
            cadres: await cadre.locator('[data-frame="panel"] [data-frame="tone"]').count(),
            navigations,
          }),
          { timeout: 15_000 },
        )
        .toMatchObject({ cadres: 1, navigations: expect.any(Number) })

      // Hors du sondage : une plainte ne s'efface pas, donc sondée elle coûtait
      // les quinze secondes pleines avant de rougir.
      expect(plaintes).toEqual([])
    } finally {
      await page.close()
      await started.server.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// Le risque que `DCJ-170` demandait de lever : React Compiler est actif sur le
// projet cible. Tous les cas navigateur tournent sur une démonstration qui le
// déclare, mais « vert avec le compilateur déclaré » ne dit pas qu'il a tourné.
// Ce cas lit le module transformé, donc il le dit.
describe('React Compiler, déclaré par le projet', () => {
  test('transforme le composant que la preview sert', { timeout: 120_000 }, async () => {
    // Une copie, comme les autres cas : `startDev` écrit le manifeste sous la
    // racine qu'il reçoit, et la démonstration est suivie par git.
    const root = mkdtempSync(join(demo, '..', 'tmp-demo-'))
    cpSync(demo, root, { recursive: true })

    // Pas de garde sur le cache d'optimisation ici : la racine est un `mkdtemp`
    // neuf, donc Vite jette de toute façon le cache hérité, et ce cas n'ouvre
    // aucune page qu'un rechargement pourrait atteindre.
    const started = await startDev(root, () => {})

    try {
      // `transformRequest` plutôt qu'une requête : la chaîne de plugins est la
      // même, sans serveur à l'écoute ni socket à fermer. Mesuré, une requête
      // laissait `server.close()` bloqué jusqu'au couperet de 120 s.
      const servi = await started.server.transformRequest('/src/components/Badge.tsx')

      // Le cache de mémoïsation du compilateur, et son exécution : les deux
      // formes qu'aucune autre transformation ne produit.
      // `compiler-runtime` sans son paquet : l'analyse des imports le réécrit en
      // `/node_modules/.crypte/deps/react_compiler-runtime.js`.
      expect(servi?.code).toContain('compiler-runtime')
      expect(servi?.code).toMatch(/const \$ = _c\(\d+\)/)

      // Et le composant reste exporté sous son nom, ce que le manifeste suppose.
      expect(servi?.code).toContain('export function Badge')
    } finally {
      started.unwatch()
      await started.server.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
