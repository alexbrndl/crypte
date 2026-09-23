// Le serveur démarré, Chromium ouvert, et ce qui s'affiche vérifié : une route
// qui répond ne dit pas qu'une story se rend, et au moment où ces cas ont été
// écrits toutes les routes répondaient sur une page blanche.
//
// Ils copient `apps/demo` avant de la démarrer, `startDev` écrivant sous la
// racine reçue et l'empreinte de la démonstration étant suivie par git.
// L'optimiseur pouvant déclencher un `full-reload` après le crawl, ils sondent
// le nombre de navigations du cadre au lieu de l'affirmer.

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Frame, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, test as base } from 'vitest'
import { startDev } from '../src/dev'
import { storyFilesOf } from '../src/manifest'

// Ce que l'utilisateur voit vraiment, dans un navigateur. Les autres cas
// prouvent que les routes répondent ; ceux-ci prouvent qu'une story s'affiche,
// ce qu'un code HTTP ne dit pas.
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

// Une copie de la démonstration, cache d'optimisation retiré. Un cache écrit par
// une autre configuration fait réoptimiser sous la page, ce qui est `DCJ-221`,
// et chaque cas rougirait alors pour cette raison. Posé avant d'être retiré :
// `apps/demo` n'a pas toujours de cache, et l'affirmation passait sans rien
// surveiller. `7483a9c` avait perdu cette ligne en silence.
function copie(): string {
  const root = mkdtempSync(join(demo, '..', 'tmp-demo-'))
  cpSync(demo, root, { recursive: true })

  mkdirSync(join(root, 'node_modules', '.crypte', 'deps'), { recursive: true })
  rmSync(join(root, 'node_modules', '.crypte'), { recursive: true, force: true })
  expect(existsSync(join(root, 'node_modules', '.crypte', 'deps'))).toBe(false)

  return root
}

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
  // Ce que la page a écrit en erreur dans la console, depuis son ouverture.
  plaintes: () => string[]
}

const test = base.extend<{ ecran: Ecran }>({
  // Le paramètre vide est la forme que vitest lit pour savoir quelles fixtures
  // initialiser. Le renommer fait collecter zéro test : mesuré. Le lint le
  // signale, et c'est un avertissement assumé.
  ecran: async ({}, use) => {
    const root = copie()

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
        plaintes: () => plaintes,
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

// Le shell servi est une copie préconstruite, pas les sources. Éditer
// `apps/shell/src` sans reconstruire laisse donc tous les cas ci-dessous juger
// la version d'avant, et ils passent. Mesuré : une heure perdue à chercher
// pourquoi l'arbre ne se rafraîchissait pas, alors que le correctif était là.
function recent(folder: string): number {
  return Math.max(
    ...readdirSync(folder, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile())
      .map((entry) => statSync(join(entry.parentPath, entry.name)).mtimeMs),
  )
}

describe('la copie du shell', () => {
  base('n’est pas plus vieille que ses sources', () => {
    const ici = dirname(fileURLToPath(import.meta.url))
    expect(
      recent(join(ici, '..', 'dist', 'shell')) >=
        recent(join(ici, '..', '..', '..', 'apps', 'shell', 'src')),
      'la copie du shell est plus vieille que `apps/shell/src` : lance `vp run -r pack`, ' +
        'sinon les cas navigateur jugent la version d’avant et passent quand même',
    ).toBe(true)
  })
})

// Plus de `retry` : celui d'avant contournait `DCJ-221`, une réoptimisation des
// dépendances dont la preview ne se relevait pas. La cause est corrigée, les
// paquets que la configuration nomme étant pré-empaquetés, et le cas à froid
// plus bas la reproduit à la demande.
describe('l’écran', () => {
  // Le jumeau du cas ci-dessous, à l'**import** plutôt qu'au rendu. La
  // découverte lit les fichiers sans les exécuter, donc un fichier qui lève à
  // l'import entre au catalogue. Importé statiquement, il emportait l'entrée
  // entière : cadre vide, aucun `ready`, et le shell muet sur les autres stories
  // qui, elles, rendent très bien. Mesuré dans un navigateur, `DCJ-279`.
  test('nomme une story qui lève à l’import, et laisse les autres rendre', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    writeFileSync(
      join(ecran.root, 'stories', 'Cassee.tsx'),
      [
        "import { defineStories } from '@crypte/react'",
        "import { Tag } from '@/components/Tag'",
        '',
        "throw new Error('cette story lève à l’import')",
        '',
        'export default defineStories(Tag, { stories: { Une: {} } })',
        '',
      ].join('\n'),
    )

    // Le fichier ajouté change l'arbre, donc le cadre se recharge. `exact`, sinon
    // « Une » attrape « Avec une classe » par sous-chaîne : mesuré, le cas
    // cliquait une story saine et vérifiait donc l'inverse de ce qu'il annonce.
    const cassee = ecran.page.getByRole('button', { name: 'Une', exact: true })
    await expect.poll(() => cassee.count()).toBe(1)

    await cassee.click()

    const alerte = ecran.page.getByRole('alert')
    await expect.poll(() => alerte.isVisible()).toBe(true)
    await expect.poll(() => alerte.textContent()).toContain('cette story lève à l’import')

    // La moitié qui compte : les autres rendent toujours. Avant, aucune ne
    // rendait, l'entrée n'ayant jamais fini de charger.
    await ecran.page.getByRole('button', { name: 'Nue', exact: true }).click()
    await expect.poll(ecran.vu).toBe('Étiquette')
  })

  // L'autre sens du cas ci-dessus : une story qui marchait, qu'une modification
  // casse. Vite garde alors l'ancien module sans rien dire, et le shell
  // réaffichait la version d'avant l'édition avec son statut « rendu ». DCJ-296.
  test('dit qu’une story saine ne rend plus quand une modification la casse', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    const file = join(ecran.root, 'stories', 'Badge.tsx')
    const saine = readFileSync(file, 'utf8')
    writeFileSync(file, `${saine}\nthrow new Error('cassée par la modification')\n`)

    const alerte = ecran.page.getByRole('alert')
    await expect.poll(() => alerte.textContent()).toContain('cassée par la modification')

    // Et la réparation fait oublier l'échec.
    writeFileSync(file, saine)
    await expect.poll(() => alerte.count()).toBe(0)
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
    // Une sauvegarde réexécute l'entrée. Sans le `dispose` de l'entrée, l'ancienne
    // racine React restait accrochée au conteneur, et la console le disait :
    // « createRoot() on a container that has already been passed ». DCJ-290.
    expect(ecran.plaintes()).toEqual([])
  })
})

// Le critère de fin de `DCJ-217` : un fichier dont une clé de story est calculée,
// un autre dont un bloc de props porte un spread. L'utilisateur voit une erreur
// pour le premier sans la chercher, une note discrète pour le second, et ni l'un
// ni l'autre ne l'empêche de travailler.
describe('ce que le catalogue a laissé de côté, à l’écran', () => {
  base('se voit sans empêcher de travailler', { timeout: 120_000 }, async () => {
    const root = copie()

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

// Une configuration en TypeScript. L'entrée recopie l'expression de
// `crypte.config.ts` telle quelle, et un module virtuel n'est pas transformé par
// son extension : `as never` partait au navigateur, qui mourait sur un
// `SyntaxError` avant le canal, donc sans `ready` et sur un cadre vide. `DCJ-224`.
//
// Le seul cas à froid, sans préchauffage : ni fetch de l'entrée ni
// `waitForRequestsIdle` avant `page.goto`. C'est lui qui voit une réoptimisation
// vider `#root` au premier chargement. Ne pas lui donner la fixture `ecran`, qui
// préchauffe.
describe('une configuration qui porte de la syntaxe TypeScript', () => {
  base('laisse la preview rendre', { timeout: 120_000 }, async () => {
    // Les trois formes qu'un auteur écrit vraiment : une assertion, un argument
    // de type, un `satisfies`. Chacune seule suffisait à vider le cadre.
    //
    // Construites et affirmées **avant** la copie : une assertion qui rougit ici
    // laisserait sinon une copie entière d'`apps/demo` sur le disque, invisible
    // puisque `apps/tmp-demo-*` est ignoré par git.
    const source = readFileSync(join(demo, 'crypte.config.ts'), 'utf8')
    const typée = source
      .replace(
        "import crypte from '@crypte/react'",
        "import crypte, { type Adapter } from '@crypte/react'",
      )
      .replace('adapter: crypte(),', 'adapter: crypte() satisfies Adapter as Adapter,')
      .replace('wrap: Panel,', 'wrap: Panel as typeof Panel,')

    expect(typée).toContain('type Adapter')
    expect(typée).toContain('satisfies Adapter as Adapter')
    expect(typée).toContain('wrap: Panel as typeof Panel')

    const root = copie()
    writeFileSync(join(root, 'crypte.config.ts'), typée)

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
