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
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { startDev } from '../src/dev'

// Une configuration en TypeScript, servie à un navigateur. L'entrée recopie
// l'expression de `crypte.config.ts` telle quelle, et un module virtuel n'est
// pas transformé par son extension : mesuré, la renommer en `.ts` ne change
// rien. `as never` partait donc au navigateur, qui mourait sur un `SyntaxError`
// avant le canal, donc sans `ready` et sur un cadre vide. `DCJ-224`.

const demo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'demo')

let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch()
}, 180_000)

afterAll(async () => {
  await browser?.close()
})

describe('une configuration qui porte de la syntaxe TypeScript', () => {
  test('laisse la preview rendre', { timeout: 120_000 }, async () => {
    // Les trois formes qu'un auteur écrit vraiment : une assertion, un argument
    // de type, un `satisfies`. Chacune seule suffisait à vider le cadre.
    //
    // Construites et affirmées **avant** la copie : une assertion qui rougit ici
    // laisserait sinon une copie entière d'`apps/demo` sur le disque, invisible
    // puisque `apps/tmp-demo-*` est ignoré par git.
    const source = readFileSync(join(demo, 'crypte.config.ts'), 'utf8')
    const typée = source
      .replace(
        "import { createAdapter } from '@crypte/react'",
        "import { createAdapter, type Adapter } from '@crypte/react'",
      )
      .replace(
        'adapter: createAdapter(),',
        'adapter: createAdapter() satisfies Adapter as Adapter,',
      )
      .replace('wrap: Panel,', 'wrap: Panel as typeof Panel,')

    expect(typée).toContain('type Adapter')
    expect(typée).toContain('satisfies Adapter as Adapter')
    expect(typée).toContain('wrap: Panel as typeof Panel')

    const root = mkdtempSync(join(demo, '..', 'tmp-demo-'))
    cpSync(demo, root, { recursive: true })
    writeFileSync(join(root, 'crypte.config.ts'), typée)

    // Comme les deux autres cas navigateur : un cache d'optimisation hérité de la
    // copie fait réoptimiser sous la page, donc ce cas rougirait pour `DCJ-221`
    // et l'accusation tomberait sur la compilation de l'entrée. Posé avant d'être
    // retiré, sinon l'affirmation ne surveille rien.
    mkdirSync(join(root, 'node_modules', '.crypte', 'deps'), { recursive: true })
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
      await page.goto(`http://localhost:${address.port}`)

      // Bavard comme les autres cas navigateur : un `#root` vide ne nomme
      // personne, et c'est la plainte du navigateur qui dit la panne.
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

      // Le symptôme exact, pour qu'un futur changement d'entrée ne le ramène pas
      // sous un autre message.
      expect(plaintes.filter((une) => /SyntaxError|Unexpected/.test(une))).toEqual([])
    } finally {
      await page.close()
      await started.server.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
