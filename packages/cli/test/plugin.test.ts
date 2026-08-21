import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { startDev } from '../src/dev'

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
    expect(nue).not.toContain('vite:')
    expect(nue).toContain('adapter: crypte()')

    const root = mkdtempSync(join(demo, '..', 'tmp-demo-'))
    cpSync(demo, root, { recursive: true })
    writeFileSync(join(root, 'crypte.config.ts'), nue)

    const started = await startDev(root, () => {})
    await started.server.listen()
    const address = started.server.httpServer?.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')

    const page = await browser.newPage()
    const plaintes: string[] = []
    page.on('pageerror', (error) => plaintes.push(error.message))

    try {
      await page.goto(`http://localhost:${address.port}`)

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
      expect(await cadre.locator('[data-frame="panel"] [data-frame="tone"]').count()).toBe(1)
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
