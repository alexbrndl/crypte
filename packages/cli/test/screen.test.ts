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
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Frame, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, test as base } from 'vitest'
import type { ViteDevServer } from 'vite'
import sirv from 'sirv'
import { BUILD_OUTPUT, build } from '../src/commands/build'
import { startDev, type Started } from '../src/commands/dev'
import { storyId } from '@crypte/core/protocol'
import { storyFilesOf } from '../src/catalogue/manifest'

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
const demoVue = join(demo, '..', 'demo-vue')

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
  // Le serveur, pour les cas qui forcent un ordre entre son surveillant et le nôtre.
  server: ViteDevServer
  // Le catalogue servi, pour les cas qui fabriquent un écart avec les modules.
  held: Started['held']
  // L'état visible, avec ce que la page a dit : un `#root` vide seul ne dit pas
  // si la preview a échoué, si le shell affiche une erreur, ou si rien n'est
  // encore arrivé. Sans ça, un échec se lit « expected '' to contain … » et ne
  // nomme personne.
  vu: () => Promise<string>
  // Le nombre de fois que le cadre a navigué, pour distinguer une mise à jour à
  // chaud d'un rechargement.
  navigations: () => Promise<number>
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
    // La preview visible seule, par le titre de son cadre : la preview cachée de
    // l'audit, lancé au démarrage, charge la même page, et sa navigation tombait
    // parfois après la photo du compteur. Mesuré : « expected 2 to be 1 » sur un
    // runner, et toujours une navigation « accessibility audit » vers 240 ms.
    const navigations: Promise<string | null>[] = []

    page.on('framenavigated', (frame: Frame) => {
      if (frame.url().includes('/preview.html'))
        navigations.push(
          frame
            .frameElement()
            .then((element) => element.getAttribute('title'))
            .catch(() => null),
        )
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
        server: started.server,
        held: started.held,
        navigations: async () =>
          (await Promise.all(navigations)).filter((title) => title === 'preview').length,
        plaintes: () => plaintes,
        vu: async () => {
          const rendu = await page
            .frameLocator('iframe[title="preview"]')
            .locator('#root')
            .textContent()
            .catch(() => '<cadre absent>')

          if (rendu) return rendu

          const etat = await page.locator('.status-bar > p').textContent()

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

describe('the shell copy', () => {
  // Le shell et `@crypte/ui`, construit comme une entrée de son build, partagent
  // une copie de Reka : copié tel quel, le `dist` de `@crypte/ui` en portait une
  // seconde, 19 kB gzip de plus. Compté par une chaîne que seul Reka écrit.
  base('carries one copy of Reka', () => {
    const shell = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'shell')
    const modules = readdirSync(shell, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))

    expect(modules.length).toBeGreaterThan(1)
    expect(modules.filter((one) => one.includes('data-reka-popper-content-wrapper'))).toHaveLength(
      1,
    )
  })

  base('is not older than its sources', () => {
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
describe('the screen', () => {
  // Le jumeau du cas ci-dessous, à l'**import** plutôt qu'au rendu. La
  // découverte lit les fichiers sans les exécuter, donc un fichier qui lève à
  // l'import entre au catalogue. Importé statiquement, il emportait l'entrée
  // entière : cadre vide, aucun `ready`, et le shell muet sur les autres stories
  // qui, elles, rendent très bien. Mesuré dans un navigateur, `DCJ-279`.
  test('names a story that throws on import and lets the others render', async ({ ecran }) => {
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
    const cassee = ecran.page.getByRole('treeitem', { name: 'Une', exact: true })
    await expect.poll(() => cassee.count()).toBe(1)

    await cassee.click()

    const alerte = ecran.page.getByRole('alert')
    await expect.poll(() => alerte.isVisible()).toBe(true)
    await expect.poll(() => alerte.textContent()).toContain('cette story lève à l’import')

    // La moitié qui compte : les autres rendent toujours. Avant, aucune ne
    // rendait, l'entrée n'ayant jamais fini de charger.
    await ecran.page.getByRole('treeitem', { name: 'Nue', exact: true }).click()
    await expect.poll(ecran.vu).toBe('Étiquette')
  })

  // L'autre sens du cas ci-dessus : une story qui marchait, qu'une modification
  // casse. Vite garde alors l'ancien module sans rien dire, et le shell
  // réaffichait la version d'avant l'édition avec son statut « rendu ». DCJ-296.
  test('says a healthy story no longer renders when an edit breaks it', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    const file = join(ecran.root, 'stories', 'Badge.tsx')
    const saine = readFileSync(file, 'utf8')
    writeFileSync(file, `${saine}\nthrow new Error('cassée par la modification')\n`)

    const alerte = ecran.page.getByRole('alert')
    await expect.poll(() => alerte.textContent()).toContain('cassée par la modification')

    // Et la réparation fait oublier l'échec. Pas tout de suite : le surveillant
    // de Vite ignore une seconde modification du même fichier dans les 50 ms qui
    // suivent la première. En CI, la réparation tombait 23 ms après la casse et
    // n'était jamais vue. Un auteur ne corrige pas aussi vite.
    await new Promise((resolve) => setTimeout(resolve, 300))
    writeFileSync(file, saine)
    await expect.poll(() => alerte.count()).toBe(0)
    await expect.poll(ecran.vu).toBe('Nouveau')
  })

  // Une story renommée recharge le cadre par notre surveillant, 20 ms après
  // l'écriture, et Vite ne voit le fichier qu'avec le sien. Passé en second, il
  // servait au cadre rechargé l'ancien module, où le nouveau nom n'existe pas :
  // les props de base, sous « rendu ». Le retard force l'ordre, que la machine
  // ne donne qu'une fois sur quinze. DCJ-315.
  test('renders a renamed story with its own props before Vite sees the file', async ({
    ecran,
  }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    await ecran.page.getByRole('treeitem', { name: 'Libellé long', exact: true }).click()
    await expect.poll(ecran.vu).toBe('Vérification en cours')

    const watcher = ecran.server.watcher
    const emit = watcher.emit.bind(watcher)
    watcher.emit = ((event: string, ...rest: unknown[]) => {
      if (event !== 'change') return emit(event, ...rest)
      setTimeout(() => emit(event, ...rest), 300)
      return true
    }) as typeof watcher.emit

    const file = join(ecran.root, 'stories', 'Badge.tsx')
    writeFileSync(file, readFileSync(file, 'utf8').replace("'Libellé long':", "'Très long':"))

    // Échantillonné plutôt qu'attendu : le mauvais rendu durait jusqu'à ce que
    // Vite voie le fichier, puis se corrigeait, et un `poll` sur l'état final
    // passait par-dessus.
    const etat = ecran.page.locator('.status-bar > p')
    const vus = new Set<string>()
    for (let i = 0; i < 20; i += 1) {
      vus.add(`${await etat.textContent()} => ${await ecran.vu()}`)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    // Sans erreur non plus : c'est ce que la garde du cas suivant rend à la
    // place du mauvais rendu, et elle masquerait le retour de la course. Un
    // cadre vide est celui qui se recharge, le statut d'avant encore affiché.
    expect(
      [...vus].filter((vu) => /^render error|^badge--tres-long rendered => (?!<vide>)/.test(vu)),
    ).toEqual(['badge--tres-long rendered => Vérification en cours'])
  })

  // L'autre moitié : un module qui n'a pas la story que le manifeste nomme dit
  // qu'il ne peut pas la rendre. L'écart est fabriqué côté manifeste, une entrée
  // ajoutée au catalogue servi, plutôt que par une course à provoquer. Le fichier
  // sans bloc `stories` est l'autre branche : seule la story implicite y existe.
  test.for([
    ['a stories block', 'Tag.tsx', undefined],
    [
      'no stories block',
      'Seule.tsx',
      [
        "import { defineStories } from '@crypte/react'",
        "import { Tag } from '@/components/Tag'",
        '',
        "export default defineStories(Tag, { props: { children: 'Seule' } })",
        '',
      ].join('\n'),
    ],
  ] as const)(
    'says a story is missing from the loaded module of a file with %s',
    async ([, fichier, contenu], { ecran }) => {
      await expect.poll(ecran.vu).toBe('Nouveau')

      if (contenu) {
        writeFileSync(join(ecran.root, 'stories', fichier), contenu)
        await expect
          .poll(() => ecran.page.getByRole('treeitem', { name: 'Default', exact: true }).count())
          .toBe(1)
      }

      const entries = ecran.held.catalogue.manifest.entries
      const modele = entries.find(
        (entry) => entry.type === 'story' && entry.storyFile === `stories/${fichier}`,
      )
      if (modele?.type !== 'story') throw new Error(`aucune story dans ${fichier}`)
      entries.push({ ...modele, id: 'absente--absente', name: 'Absente' })

      // Relu au chargement seulement, par le shell comme par la preview.
      await ecran.page.reload()
      await ecran.page.getByRole('treeitem', { name: 'Absente', exact: true }).click()

      const alerte = ecran.page.getByRole('alert')
      await expect
        .poll(() => alerte.textContent({ timeout: 1000 }).catch(() => ecran.vu()))
        .toContain(`stories/${fichier} has no story named "Absente"`)
    },
  )

  // Un fichier supprimé fait d'abord échouer son rechargement à chaud, puis le
  // shell perd la story. L'alerte de cet échec restait affichée par-dessus.
  // Notre rechargement est retenu jusqu'à ce que l'alerte soit là : passé
  // avant, il n'en laissait aucune, et le cas passait sans rien éprouver.
  test('drops the error of a story whose file was deleted', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    await ecran.page.getByRole('treeitem', { name: 'Nue', exact: true }).click()
    await expect.poll(ecran.vu).toBe('Étiquette')

    const hot = ecran.server.hot
    const send = hot.send.bind(hot) as (...args: unknown[]) => void
    const retenus: unknown[][] = []
    hot.send = ((...args: unknown[]) => {
      const payload = args[0] as { type?: string }
      if (payload.type === 'full-reload') retenus.push(args)
      else send(...args)
    }) as typeof hot.send

    rmSync(join(ecran.root, 'stories', 'Tag.tsx'))

    const alerte = ecran.page.getByRole('alert')
    await expect.poll(() => alerte.count()).toBe(1)
    await expect.poll(() => retenus.length).toBe(1)
    hot.send = send as typeof hot.send
    for (const args of retenus) send(...args)

    const etat = ecran.page.locator('.status-bar > p')
    await expect.poll(() => etat.textContent()).toBe('the story on display is gone')
    await expect.poll(() => ecran.page.getByRole('alert').count()).toBe(0)
  })

  // Le même défaut un niveau plus bas : c'est le composant qui casse, et Fast
  // Refresh garde l'ancien sans rien dire.
  test('says a story no longer renders when its component breaks', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    const file = join(ecran.root, 'src', 'components', 'Badge.tsx')
    const sain = readFileSync(file, 'utf8')
    writeFileSync(file, `${sain}\nthrow new Error('composant cassé')\n`)

    const alerte = ecran.page.getByRole('alert')
    await expect.poll(() => alerte.textContent()).toContain('composant cassé')

    // Une story voisine modifiée fait réexécuter l'entrée, qui range alors
    // l'échec sous le fichier de la story Badge : c'est ce fichier-là que la
    // réparation du composant doit aussi délivrer.
    const voisine = join(ecran.root, 'stories', 'Tag.tsx')
    writeFileSync(voisine, `${readFileSync(voisine, 'utf8')}\n`)
    await new Promise((resolve) => setTimeout(resolve, 500))
    await expect.poll(() => alerte.textContent()).toContain('composant cassé')

    // Hors de la fenêtre de 50 ms du surveillant, voir le cas ci-dessus.
    await new Promise((resolve) => setTimeout(resolve, 300))
    writeFileSync(file, sain)
    await expect.poll(() => alerte.count()).toBe(0)
    await expect.poll(ecran.vu).toBe('Nouveau')
  })

  // Un composant qui ne se charge pas faisait accuser le fichier de story par
  // « Failed to fetch dynamically imported module ». Le fichier fautif et sa
  // ligne viennent de l'erreur que Vite rapporte pour ce module.
  test.for([
    ['a syntax error', (sain: string) => `${sain}\nconst = ;\n`, 'Unexpected token'],
    [
      'a missing import',
      (sain: string) => `import { nope } from './introuvable'\nconsole.log(nope)\n${sain}`,
      'introuvable',
    ],
  ] as const)('names the component file and line on %s', async ([, casse, attendu], { ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    const file = join(ecran.root, 'src', 'components', 'Badge.tsx')
    writeFileSync(file, casse(readFileSync(file, 'utf8')))

    const alerte = ecran.page.getByRole('alert')
    await expect.poll(() => alerte.textContent()).toMatch(/src\/components\/Badge\.tsx:\d+:\d+/)
    expect(await alerte.textContent()).toContain(attendu)
    expect(await alerte.textContent()).not.toContain('Failed to fetch')
  })

  // Une story qui importe un nom que son module n'exporte pas : le navigateur ne
  // nomme que le module, avec le `?t=` de Vite, et la story qui ne se charge
  // plus n'était pas dite. DCJ-317.
  test('names the story that imports a name its module does not export', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    const file = join(ecran.root, 'stories', 'Badge.tsx')
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(
        "import { Badge } from '@/components/Badge'",
        "import { Badge, Absent } from '@/components/Badge'\nconsole.log(Absent)",
      ),
    )

    const alerte = ecran.page.getByRole('alert')
    await expect
      .poll(() =>
        alerte
          .locator('p')
          .textContent({ timeout: 1000 })
          .catch(() => ecran.vu()),
      )
      .toBe('stories/Badge.tsx cannot load: src/components/Badge.tsx does not export Absent')
  })

  // Le même import, depuis un composant qui se recharge : il reste à part tant
  // qu'il ne se recharge pas, et c'est lui qu'il faut nommer.
  test('names the component that imports a name its module does not export', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    const file = join(ecran.root, 'src', 'components', 'Badge.tsx')
    writeFileSync(
      file,
      `import { Absent } from './Tag'\nconsole.log(Absent)\n${readFileSync(file, 'utf8')}`,
    )

    const alerte = ecran.page.getByRole('alert')
    await expect
      .poll(() =>
        alerte
          .locator('p')
          .textContent({ timeout: 1000 })
          .catch(() => ecran.vu()),
      )
      .toBe('src/components/Badge.tsx cannot load: src/components/Tag.tsx does not export Absent')
  })

  // Deux composants cassés : la story nomme le sien, pas le dernier cassé. Une
  // erreur gardée seule et pour toujours faisait accuser `Tag.tsx` pour l'échec
  // de `Badge.tsx`. Puis, une fois réparés, leurs erreurs sont oubliées : restées,
  // elles empêchaient de nommer le composant d'une story ajoutée ensuite.
  test('names its own component while another is broken, then forgets both', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    const badge = join(ecran.root, 'src', 'components', 'Badge.tsx')
    const tag = join(ecran.root, 'src', 'components', 'Tag.tsx')
    const badgeSain = readFileSync(badge, 'utf8')
    const tagSain = readFileSync(tag, 'utf8')
    // Hors de la fenêtre de 50 ms du surveillant entre deux écritures.
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    writeFileSync(badge, `${badgeSain}\nconst = ;\n`)
    const alerte = ecran.page.getByRole('alert')
    await expect.poll(() => alerte.textContent()).toMatch(/Badge\.tsx:\d+/)

    await pause(300)
    writeFileSync(tag, `${tagSain}\nconst = ;\n`)
    await pause(1_500)
    expect(await alerte.textContent()).toMatch(/Badge\.tsx:\d+/)
    expect(await alerte.textContent()).not.toContain('Tag.tsx')

    writeFileSync(tag, tagSain)
    await pause(300)
    writeFileSync(badge, badgeSain)
    await expect.poll(() => alerte.count()).toBe(0)
    await expect.poll(ecran.vu).toBe('Nouveau')

    writeFileSync(
      join(ecran.root, 'src', 'components', 'Rompu.tsx'),
      'export const Rompu = () => <p>rompu</p>\nconst = ;\n',
    )
    writeFileSync(
      join(ecran.root, 'stories', 'Rompu.tsx'),
      [
        "import { defineStories } from '@crypte/react'",
        "import { Rompu } from '@/components/Rompu'",
        '',
        'export default defineStories(Rompu, { stories: { Rompue: {} } })',
        '',
      ].join('\n'),
    )
    const rompue = ecran.page.getByRole('treeitem', { name: 'Rompue', exact: true })
    await expect.poll(() => rompue.count()).toBe(1)
    await rompue.click()
    await expect.poll(() => alerte.textContent()).toMatch(/src\/components\/Rompu\.tsx:\d+:\d+/)
  })

  // Le même défaut au chargement de l'entrée : une story ajoutée dont le
  // composant ne se charge pas échoue à son import, pas à une reprise à chaud.
  test('names the component file when a new story cannot load it', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    writeFileSync(
      join(ecran.root, 'src', 'components', 'Rompu.tsx'),
      'export const Rompu = () => <p>rompu</p>\nconst = ;\n',
    )
    writeFileSync(
      join(ecran.root, 'stories', 'Rompu.tsx'),
      [
        "import { defineStories } from '@crypte/react'",
        "import { Rompu } from '@/components/Rompu'",
        '',
        'export default defineStories(Rompu, { stories: { Rompue: {} } })',
        '',
      ].join('\n'),
    )

    const rompue = ecran.page.getByRole('treeitem', { name: 'Rompue', exact: true })
    await expect.poll(() => rompue.count()).toBe(1)
    await rompue.click()

    const alerte = ecran.page.getByRole('alert')
    await expect.poll(() => alerte.textContent()).toMatch(/src\/components\/Rompu\.tsx:2:\d+/)
    expect(await alerte.textContent()).not.toContain('Failed to fetch')
  })

  // `iframe.html` n'a pas de shell pour redemander la story : elle passe par le
  // même chemin, donc les plugins la suivent et une édition la redessine.
  test('draws iframe.html with its plugins, and again after an edit', async ({ ecran }) => {
    const address = ecran.server.httpServer?.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')
    const seule = await browser.newPage()
    try {
      await seule.goto(`http://localhost:${address.port}/iframe.html?id=badge--par-defaut`)
      await expect.poll(() => seule.locator('#root').textContent()).toBe('Nouveau')
      await expect.poll(() => seule.locator('html').getAttribute('data-hello-renders')).toBe('1')

      const file = join(ecran.root, 'stories', 'Badge.tsx')
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace("label: 'Nouveau'", "label: 'Nouveau !'"),
      )
      await expect.poll(() => seule.locator('#root').textContent()).toBe('Nouveau !')
    } finally {
      await seule.close()
    }
  })

  // Ce que React rafraîchit lui-même : le composant est repris par Fast Refresh,
  // pas par le chemin chaud de l'entrée.
  test('refreshes the displayed story when its component changes', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    await ecran.page.getByRole('treeitem', { name: 'Libellé long' }).click()
    await expect.poll(ecran.vu).toBe('Vérification en cours')

    const file = join(ecran.root, 'src', 'components', 'Badge.tsx')
    writeFileSync(file, readFileSync(file, 'utf8').replace('{label}', '{`${label} !`}'))

    const avant = await ecran.navigations()

    await expect.poll(ecran.vu).toBe('Vérification en cours !')

    // La story affichée n'a pas changé : c'est tout l'enjeu, un rechargement qui
    // ramène à la première story fait perdre sa place à chaque frappe.
    await expect
      .poll(() =>
        ecran.page.getByRole('treeitem', { name: 'Libellé long' }).getAttribute('aria-selected'),
      )
      .toBe('true')

    expect(await ecran.navigations()).toBe(avant)
  })

  // Le fichier de story n'exporte aucun composant, donc Fast Refresh ne s'en
  // saisit pas : sans le chemin chaud de l'entrée, Vite ne trouve personne pour
  // accepter et recharge le cadre. Mesuré, c'est ce cas et non le précédent qui
  // éprouve `hot`.
  test('refreshes a story’s props without reloading the frame', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    const avant = await ecran.navigations()
    const file = join(ecran.root, 'stories', 'Badge.tsx')

    writeFileSync(file, readFileSync(file, 'utf8').replace("'Nouveau'", "'Renouvelé'"))

    await expect.poll(ecran.vu).toContain('Renouvelé')

    expect(await ecran.navigations()).toBe(avant)
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
describe('what the catalogue left out, on screen', () => {
  base('shows without blocking work', { timeout: 120_000 }, async () => {
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
      expect(await écartés.first().textContent()).toContain('1 story read, some are missing')

      // Rien n'empêche de travailler : la story lue du même fichier est là et
      // rend, ce qui est la moitié qu'un message ne doit pas coûter.
      await page.getByRole('treeitem', { name: 'Lue', exact: true }).click()
      await expect
        .poll(() => page.frameLocator('iframe[title="preview"]').locator('#root').textContent(), {
          timeout: 30_000,
        })
        .toBe('Lue')

      // La note discrète, sur la story dont la fiche est partielle.
      await page.getByRole('treeitem', { name: 'Un', exact: true }).click()
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
describe('a config that carries TypeScript syntax', () => {
  base('lets the preview render', { timeout: 120_000 }, async () => {
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

// Les deux surfaces navigateur d'un plugin, section 6.1 des contrats : le plugin
// `hello` de la démonstration pose un bouton dans le shell et une marque dans
// l'iframe.
describe('a plugin in the browser', () => {
  const panneau = (page: Page) =>
    page.locator('[data-plugin="hello"] .body').getByRole('button', { name: /clic/ })
  const cadre = (page: Page) => page.frameLocator('iframe[title="preview"]')

  test('shows its shell module and runs its preview module', async ({ ecran }) => {
    await expect.poll(() => panneau(ecran.page).textContent()).toBe('hello, 0 clic(s)')
    await expect
      .poll(() => cadre(ecran.page).locator('html').getAttribute('data-hello-renders'))
      .toBe('1')
  })

  // La chaîne entière : le CLI mesure, ses routes portent, le shell affiche.
  // `axe-core` fait presque tout le poids d'`a11y`, et `tokens` n'envoie rien
  // au navigateur.
  test('weighs the shell and each plugin, and times the first render', async ({ ecran }) => {
    const chiffres = ecran.page.locator('.figures li')
    await expect.poll(() => chiffres.count()).toBe(2)
    await expect.poll(() => ecran.page.locator('.status-bar .render').count()).toBe(1)

    expect(await chiffres.allInnerTexts()).toEqual([
      expect.stringMatching(/^Shell \d+\.\d kB$/),
      '7 plugins',
    ])
    expect(await ecran.page.locator('.status-bar .render').innerText()).toMatch(
      /^First render \d+ ms$/,
    )
    // Le poids de chacun dans le tooltip du compte.
    await chiffres.nth(1).locator('[tabindex]').hover()
    // Le texte que Reka garde pour les lecteurs d'écran, masqué à l'œil : `getByRole`
    // ne le compte pas.
    const bulle = ecran.page.locator('[role="tooltip"]')
    await expect.poll(() => bulle.count(), { timeout: 5000 }).toBe(1)
    expect((await bulle.textContent())?.split('\n')).toEqual([
      'tokens 0.0 kB',
      expect.stringMatching(/^controls \d\.\d kB$/),
      expect.stringMatching(/^source \d\.\d kB$/),
      expect.stringMatching(/^a11y 1\d\d\.\d kB$/),
      expect.stringMatching(/^hello \d\.\d kB$/),
      expect.stringMatching(/^status \d\.\d kB$/),
      expect.stringMatching(/^i18n \d\.\d kB$/),
    ])
  })

  // La vue d'un plugin, servie telle quelle par l'import map du shell : son
  // entrée dans l'activity bar, son canvas, et l'élément choisi dans sa sidebar,
  // que l'adresse et le panneau suivent.
  test('opens the view of a plugin from the activity bar', async ({ ecran }) => {
    await ecran.page.locator('.activity-bar a', { hasText: 'i18n' }).click()
    await expect
      .poll(() => ecran.page.locator('.plugin-view td').first().textContent())
      .toBe('Panier')
    await ecran.page.locator('.sidebar a', { hasText: 'Deutsch' }).click()
    await expect.poll(() => new URL(ecran.page.url()).search).toBe('?view=i18n&item=de')
    expect(await ecran.page.locator('#view-panel').innerText()).toContain('Deutsch: 1 missing')
    expect(ecran.plaintes()).toEqual([])
  })

  // Deux copies de Vue ne se voient pas : `inject` passe encore, et seul l'état
  // propre du panneau cesse de redessiner, sans un avertissement. Mesuré. D'où
  // le clic, puis le compte des copies par le registre que chacune tient sur
  // `globalThis`.
  test('runs the panel on the shell’s own Vue', async ({ ecran }) => {
    await panneau(ecran.page).click()

    await expect.poll(() => panneau(ecran.page).textContent()).toBe('hello, 1 clic(s)')
    expect(
      await ecran.page.evaluate(
        () =>
          (globalThis as { __VUE_INSTANCE_SETTERS__?: unknown[] }).__VUE_INSTANCE_SETTERS__?.length,
      ),
    ).toBe(1)
  })

  // Un plugin n'est pas le texte de l'auteur : son module qui lève ne coûte ni
  // la preview ni le reste du shell, et il est nommé.
  test('names a shell module that throws and keeps the rest', async ({ ecran }) => {
    writeFileSync(
      join(ecran.root, 'plugins', 'hello', 'shell.js'),
      "throw new Error('ce panneau lève à l’import')\n",
    )
    await ecran.page.reload()

    await expect
      .poll(async () => (await ecran.page.locator('.failed').textContent())?.trim())
      .toBe('hello could not load: ce panneau lève à l’import')
    await expect.poll(ecran.vu).toBe('Nouveau')
  })

  // Importé statiquement, ce module emportait l'entrée entière : aucun `ready`,
  // et un cadre vide pour toutes les stories.
  test('lets the frame render when a preview module throws', async ({ ecran }) => {
    writeFileSync(
      join(ecran.root, 'plugins', 'hello', 'preview.js'),
      "throw new Error('cette preview lève à l’import')\n",
    )
    await ecran.page.reload()

    await expect.poll(ecran.vu).toBe('Nouveau')

    // Dans le shell, et plus seulement dans la console du cadre : le message
    // `plugin-error` de la section 5.3.
    await expect
      .poll(async () =>
        (await ecran.page.locator('.failed').textContent())?.replace(/\s+/g, ' ').trim(),
      )
      .toBe(
        'hello in the preview: its preview module could not load: cette preview lève à l’import',
      )
  })
})

// Les hooks de la section 6.2 et les messages de plugin de la section 5.4, sur
// `hello` : une marque comptée après chaque rendu, et un « ping » que sa partie
// preview renvoie en `hello:pong`.
describe('the preview hooks and plugin messages', () => {
  const rendus = (page: Page) =>
    page.frameLocator('iframe[title="preview"]').locator('html').getAttribute('data-hello-renders')

  test('calls afterMount after every render', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    await expect.poll(() => rendus(ecran.page)).not.toBeNull()
    const avant = Number(await rendus(ecran.page))

    await ecran.page.getByRole('treeitem', { name: 'Nue', exact: true }).click()

    await expect.poll(ecran.vu).toBe('Étiquette')
    await expect.poll(() => rendus(ecran.page)).toBe(String(avant + 1))
  })

  test('carries a plugin message from the panel to the preview and back', async ({ ecran }) => {
    const panneau = ecran.page.locator('[data-plugin="hello"] .body')
    await expect.poll(ecran.vu).toBe('Nouveau')
    await expect.poll(() => panneau.locator('output').textContent()).toBe('hello:rendered')

    await panneau.getByRole('button', { name: 'ping', exact: true }).click()

    await expect.poll(() => panneau.locator('output').textContent()).toBe('hello:pong')
  })

  // Un module qui ne finit jamais de charger : la preview l'attendait avant la
  // première story, et restait vide sans un mot. Audit à froid du projet 1.3.
  // Le rechargement servait parfois l'ancien module, et le cas passait sans avoir
  // chargé celui qui ne finit jamais : 3 fois sur 9 avec la régression remise.
  // Attendu servi, puis affirmé absent : l'ancien pose sa marque. Audit à froid
  // du projet 1.3.
  test('renders the stories while a preview module never finishes loading', async ({ ecran }) => {
    writeFileSync(
      join(ecran.root, 'plugins', 'hello', 'preview.js'),
      'await new Promise(() => {})\nexport default {}\n',
    )
    const servi = new URL('/plugins/hello/preview.js', ecran.page.url()).href
    await expect
      .poll(async () => (await ecran.page.request.get(servi)).text())
      .toContain('new Promise')
    await ecran.page.reload()

    await expect.poll(ecran.vu).toBe('Nouveau')
    expect(
      await ecran.page
        .frameLocator('iframe[title="preview"]')
        .locator('html')
        .getAttribute('data-hello-renders'),
    ).toBeNull()
  })

  // Un hook de la réserve, exporté et jamais appelé : c'est ainsi que
  // `beforeRender` avait été ignoré sans un mot. Refusé, et dit dans le shell.
  test('says in the shell a preview module that exports a hook the preview never calls', async ({
    ecran,
  }) => {
    writeFileSync(
      join(ecran.root, 'plugins', 'hello', 'preview.js'),
      'export default { beforeMount: () => {} }\n',
    )
    await ecran.page.reload()

    await expect.poll(ecran.vu).toBe('Nouveau')
    await expect
      .poll(async () =>
        (await ecran.page.locator('.failed').textContent())?.replace(/\s+/g, ' ').trim(),
      )
      .toBe(
        'hello in the preview: `beforeMount` is not a hook the preview calls, which are afterMount and onMessage',
      )
  })
})

// L'hôte des panneaux, sur les deux plugins de la démonstration : `hello`, qui a
// toujours quelque chose à dire, et `status`, qui n'a rien à dire sur les
// stories sans statut : celles de `Tag`.
describe('the panel host', () => {
  const cadre = (page: Page, nom: string) => page.locator(`[data-plugin="${nom}"]`)

  test('shows the panels in configuration order', async ({ ecran }) => {
    await expect
      .poll(() =>
        ecran.page
          .locator('[data-plugin]')
          .evaluateAll((tous) => tous.map((un) => un.getAttribute('data-plugin'))),
      )
      .toEqual(['controls', 'source', 'a11y', 'hello', 'status'])
  })

  test('folds a panel with nothing to say, story by story', async ({ ecran }) => {
    const statut = cadre(ecran.page, 'status')
    const raison = () =>
      statut
        .locator('.inapplicable')
        .textContent({ timeout: 1_000 })
        .catch(() => null)

    // La story d'arrivée, un `Badge`, déclare `stable`.
    await expect.poll(ecran.vu).toBe('Nouveau')
    await expect.poll(() => statut.locator('.body').textContent()).toBe('status: stable')

    await ecran.page.getByRole('treeitem', { name: 'Nue', exact: true }).click()
    await expect.poll(raison).toBe('no status declared')
    expect(await statut.locator('.body').isVisible()).toBe(false)

    await ecran.page.getByRole('treeitem', { name: 'Par défaut', exact: true }).click()
    await expect.poll(() => statut.locator('.body').isVisible()).toBe(true)
    expect(await raison()).toBeNull()
    expect(await statut.locator('.body').textContent()).toBe('status: stable')
  })

  test('keeps a panel closed across a reload', async ({ ecran }) => {
    const titre = () => cadre(ecran.page, 'hello').locator('.head button')

    await titre().click()
    await expect.poll(() => titre().getAttribute('aria-expanded')).toBe('false')

    await ecran.page.reload()

    await expect.poll(() => cadre(ecran.page, 'hello').count()).toBe(1)
    expect(await titre().getAttribute('aria-expanded')).toBe('false')
    expect(await cadre(ecran.page, 'hello').locator('.body').isVisible()).toBe(false)
  })
})

// `@crypte/controls` sur la démonstration : un champ par prop, la story re-rendue
// avec ce qui est saisi, et ce qu'il dit d'un composant qu'il n'a pas pu lire.
describe('the controls panel', () => {
  const panneau = (page: Page) => page.locator('[data-plugin="controls"]')
  const cadre = (page: Page) => page.frameLocator('iframe[title="preview"]')

  // La chaîne entière : la preview dit ce qu'elle a rendu, le shell le passe au
  // panneau, les champs le montrent. `warning` n'est pas le défaut de `tone`.
  test('shows what the story rendered with, without anything typed', async ({ ecran }) => {
    await ecran.page.goto(new URL('?id=badge--avertissement', ecran.page.url()).href)
    await expect.poll(ecran.vu).toBe('Nouveau')

    await expect
      .poll(() => panneau(ecran.page).locator('input[type="text"]').getAttribute('placeholder'))
      .toBe('Nouveau')
    expect(await panneau(ecran.page).getByRole('combobox').textContent()).toBe('warning')
  })

  // Deux copies de Reka sur la page, celle du shell et celle de `@crypte/ui` :
  // la liste ouverte sous la palette, un Échap laissait le corps de la page sans
  // événements de pointeur, et plus rien ne répondait au clic. Revue de #145.
  test('leaves the shell usable after Escape closes the palette over its list', async ({
    ecran,
  }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    await panneau(ecran.page).getByRole('combobox').click()
    await ecran.page.locator('main').press('ControlOrMeta+K')
    await expect.poll(() => ecran.page.getByRole('dialog').count()).toBe(1)
    await ecran.page.keyboard.press('Escape')
    await ecran.page.keyboard.press('Escape')

    await ecran.page
      .getByRole('treeitem', { name: 'Avertissement', exact: true })
      .click({ timeout: 5000 })
    await expect.poll(() => new URL(ecran.page.url()).search).toBe('?id=badge--avertissement')
  })

  // Le shell tient les valeurs et les rend au panneau : l'en-tête les efface, et
  // les champs suivent. Plus de bouton au pied du panneau.
  test('resets every value from the head of the panel', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    const remise = panneau(ecran.page).locator('.head').getByRole('button', { name: 'Reset all' })
    const texte = panneau(ecran.page).locator('input[type="text"]')
    expect(await remise.count()).toBe(0)

    await texte.fill('Bonjour')
    await expect.poll(ecran.vu).toBe('Bonjour')
    await remise.click()

    await expect.poll(ecran.vu).toBe('Nouveau')
    expect(await texte.inputValue()).toBe('')
    expect(await remise.count()).toBe(0)
    expect(
      await panneau(ecran.page).getByRole('button', { name: 'Back to the story' }).count(),
    ).toBe(0)
  })

  test('renders the story with what is typed, without remounting it', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    await expect
      .poll(() => panneau(ecran.page).locator('label').allTextContents())
      .toEqual(['label', 'tone'])

    // Une marque sur le nœud rendu : un composant remonté la perdrait. C'est la
    // mesure qui garde `update-overrides` en réserve (DCJ-214).
    await cadre(ecran.page)
      .locator('#root span')
      .evaluate((un) => un.setAttribute('data-marque', 'gardée'))

    await panneau(ecran.page).locator('input[type="text"]').fill('Bonjour')
    await expect.poll(ecran.vu).toBe('Bonjour')

    // La liste de Reka, téléportée dans la page à l'ouverture.
    await panneau(ecran.page).getByRole('combobox').click()
    await ecran.page.getByRole('option', { name: 'warning' }).click()
    await expect
      .poll(() => cadre(ecran.page).locator('#root span').getAttribute('style'))
      .toContain('--color-warning')

    expect(await cadre(ecran.page).locator('#root span').getAttribute('data-marque')).toBe('gardée')
  })

  test('starts over from the story on another one', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    await panneau(ecran.page).locator('input[type="text"]').fill('Bonjour')
    await expect.poll(ecran.vu).toBe('Bonjour')

    await ecran.page.getByRole('treeitem', { name: 'Libellé long', exact: true }).click()

    await expect.poll(ecran.vu).not.toBe('Bonjour')
    expect(await panneau(ecran.page).locator('input[type="text"]').inputValue()).toBe('')
  })

  // Le cas de DCJ-319, écrit dans la copie : un paramètre sans type, que la
  // lecture ne suit pas. Le panneau le dit au lieu de rester vide.
  test('says why a component’s props could not be read', async ({ ecran }) => {
    writeFileSync(
      join(ecran.root, 'src', 'components', 'Opaque.tsx'),
      'export function Opaque(props) {\n  return <span>{props.text}</span>\n}\n',
    )
    writeFileSync(
      join(ecran.root, 'stories', 'Opaque.tsx'),
      [
        "import { defineStories } from '@crypte/react'",
        "import { Opaque } from '@/components/Opaque'",
        '',
        "export default defineStories(Opaque, { stories: { Opaque: { text: 'illisible' } } })",
        '',
      ].join('\n'),
    )

    // Le composant porte le même nom que sa story : la story est au niveau 2.
    const story = ecran.page.getByRole('treeitem', { name: 'Opaque', exact: true, level: 2 })
    await expect.poll(() => story.count()).toBe(1)
    await story.click()

    await expect
      .poll(async () =>
        (await panneau(ecran.page).locator('.unread').textContent())?.replace(/\s+/g, ' ').trim(),
      )
      .toBe(
        'Props not read from the component file: nothing the reader follows types its props. Only those the story declares in details appear here.',
      )
  })
})

// `@crypte/a11y` sur la démonstration : la story « Rôle inconnu » de `Tag` porte
// une violation connue, les autres n'en ont pas.
describe('the a11y panel', () => {
  const panneau = (page: Page) => page.locator('[data-plugin="a11y"]')
  const raison = (page: Page) =>
    panneau(page)
      .locator('.inapplicable')
      .textContent({ timeout: 1_000 })
      .catch(() => null)
  const cadre = (page: Page) => page.frameLocator('iframe[title="preview"]')

  test('shows a violation with its rule and the selector at fault', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    await ecran.page.getByRole('treeitem', { name: 'Rôle inconnu', exact: true }).click()

    const corps = panneau(ecran.page).locator('.body')
    await expect
      .poll(() => corps.locator('section > p').allTextContents())
      .toEqual(['Critical · 1 violation'])
    expect(await corps.locator('section code').allTextContents()).toEqual(['aria-roles', 'span'])
  })

  test('folds on a story with no violation, with the rules that passed', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    await expect
      .poll(() => raison(ecran.page))
      .toMatch(/^\d+ automatic rules passed, no violation$/)
    expect(await panneau(ecran.page).locator('.body').isVisible()).toBe(false)
  })

  // La violation retirée à la main dans l'iframe : seule une nouvelle analyse
  // peut la voir partie, et la page n'est pas rechargée pour autant.
  test('runs the analysis again without reloading', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    await ecran.page.getByRole('treeitem', { name: 'Rôle inconnu', exact: true }).click()
    const corps = panneau(ecran.page).locator('.body')
    await expect.poll(() => corps.locator('section').count()).toBe(1)
    const navigations = await ecran.navigations()

    await cadre(ecran.page)
      .locator('#root [role="etiquette"]')
      .evaluate((un) => un.removeAttribute('role'))
    await corps.getByRole('button', { name: 'Run the analysis again', exact: true }).click()

    await expect.poll(() => raison(ecran.page)).toMatch(/no violation$/)
    expect(await ecran.navigations()).toBe(navigations)
  })

  // Une story qui lève ne sera jamais analysée : le panneau attendait sans fin.
  // Audit à froid du projet 1.3.
  test('folds on a story that could not be rendered', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    await ecran.page.getByRole('treeitem', { name: 'Échoue au rendu', exact: true }).click()

    await expect.poll(() => raison(ecran.page)).toBe('the story could not be rendered')
  })

  // Replié sur une story propre, le panneau s'ouvre quand même : ce qu'on fait
  // dans l'iframe sans rendu, un menu ouvert, ne s'analyse que par la relance.
  // DCJ-327.
  test('runs the analysis again from a folded panel', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    await expect.poll(() => raison(ecran.page)).toMatch(/no violation$/)
    const navigations = await ecran.navigations()

    await panneau(ecran.page).locator('.head button').click()
    const corps = panneau(ecran.page).locator('.body')
    await expect.poll(() => corps.isVisible()).toBe(true)

    await cadre(ecran.page)
      .locator('#root span')
      .evaluate((un) => un.setAttribute('role', 'etiquette'))
    await corps.getByRole('button', { name: 'Run the analysis again', exact: true }).click()

    await expect
      .poll(() => corps.locator('section code').allTextContents())
      .toEqual(['aria-roles', 'span'])
    expect(await raison(ecran.page)).toBeNull()
    expect(await ecran.navigations()).toBe(navigations)
  })
})

// L'adresse nomme la story affichée, dans le vrai navigateur : c'est le critère
// de DCJ-172, et ni jsdom ni un serveur monté à la main ne disent qu'une adresse
// à requête sert bien le shell.
describe('the address', () => {
  test('opens the same story when pasted into another tab', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    await ecran.page.getByRole('treeitem', { name: 'Libellé long', exact: true }).click()
    await expect.poll(ecran.vu).toBe('Vérification en cours')

    const collee = await browser.newPage()
    try {
      await collee.goto(ecran.page.url())
      await expect
        .poll(() => collee.frameLocator('iframe[title="preview"]').locator('#root').textContent())
        .toBe('Vérification en cours')
      expect(
        await collee
          .getByRole('treeitem', { name: 'Libellé long', exact: true })
          .getAttribute('aria-selected'),
      ).toBe('true')
    } finally {
      await collee.close()
    }
  })

  test('goes back to the story shown before', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    await ecran.page.getByRole('treeitem', { name: 'Libellé long', exact: true }).click()
    await expect.poll(ecran.vu).toBe('Vérification en cours')

    await ecran.page.goBack()

    await expect.poll(ecran.vu).toBe('Nouveau')
  })
})

// La page composant dans le vrai navigateur : le critère de DCJ-212.
describe('the component page', () => {
  test('opens from its address, and shows a story from its list', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    const origin = new URL(ecran.page.url()).origin

    await ecran.page.goto(`${origin}/?component=badge`)

    const page = ecran.page.locator('.component-page')
    await expect.poll(() => page.locator('h2').textContent()).toBe('Badge')
    expect(await page.locator('dd').first().textContent()).toBe('stable')
    expect(await page.locator('tbody tr td:first-child').allTextContents()).toEqual(
      expect.arrayContaining([expect.stringContaining('Libellé long')]),
    )

    await page.getByRole('link', { name: 'Libellé long', exact: true }).click()

    await expect.poll(ecran.vu).toBe('Vérification en cours')
    expect(new URL(ecran.page.url()).search).toBe('?id=badge--libelle-long')
  })
})

// L'œil de l'arbre des stories, dans le vrai navigateur : survoler une story le
// montre en bout de la ligne de son composant. Le critère de DCJ-374.
describe('the eye of a component', () => {
  test('shows from a story row, and opens the docs page of its component', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    const oeil = ecran.page.getByRole('button', { name: 'Open the docs page of Badge' })
    const opacite = () =>
      ecran.page.evaluate<string>(
        'getComputedStyle(document.querySelector(\'[aria-label="Open the docs page of Badge"]\')).opacity',
      )
    expect(await opacite()).toBe('0')

    await ecran.page.getByRole('treeitem', { name: 'Libellé long', exact: true }).hover()
    await expect.poll(opacite).toBe('1')
    await oeil.click()

    await expect.poll(() => ecran.page.locator('.component-page h2').textContent()).toBe('Badge')
    expect(new URL(ecran.page.url()).search).toBe('?component=badge')
  })
})

// Les pages markdown de la démonstration : le critère de DCJ-251.
describe('the markdown pages', () => {
  test("shows a component's page on its component page, and a general one from the tree", async ({
    ecran,
  }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    await ecran.page.goto(new URL('?component=badge', ecran.page.url()).href)

    const composant = ecran.page.locator('.component-page .markdown-body')
    await expect
      .poll(() => composant.locator('h3').allTextContents())
      .toEqual(["Quand l'utiliser", 'À éviter'])

    // L'exemple vivant rend la première story dans sa propre preview.
    const exemple = ecran.page.frameLocator('.live-example iframe')
    await expect.poll(() => exemple.locator('body').innerText()).toContain('Nouveau')

    await ecran.page.getByRole('treeitem', { name: 'Accessibilité', exact: true }).click()

    const page = ecran.page.locator('.markdown-page')
    await expect.poll(() => page.locator('h2').textContent()).toBe('Accessibilité')
    expect(await page.locator('pre code').textContent()).toBe('color: var(--color-text);\n')
    expect(new URL(ecran.page.url()).search).toBe('?id=guides/accessibilite')
    expect(await ecran.page.getByRole('treeitem', { name: 'Tag', exact: true }).count()).toBe(1)
  })
})

// Les familles que `@crypte/tokens` lit dans la démonstration : le critère de DCJ-338.
describe('the tokens page', () => {
  test('lists the four categories, and opens a family from its older address', async ({
    ecran,
  }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    await ecran.page.locator('.activity-bar .item', { hasText: 'tokens' }).click()
    const categories = ecran.page.locator('.sidebar li .label')
    await expect
      .poll(() => categories.allTextContents())
      .toEqual(['color', 'space', 'radius', 'size'])

    const origin = new URL(ecran.page.url()).origin
    await ecran.page.goto(`${origin}/?id=tokens--color`)

    const vue = ecran.page.locator('.tokens-view')
    await expect.poll(() => vue.getAttribute('aria-label')).toBe('color')
    expect(await vue.locator('.item .name').allTextContents()).toEqual([
      'neutral',
      'warning',
      'text',
      'badge-background',
    ])
    expect(await vue.locator('.swatch').count()).toBe(4)
  })
})

// La vue versions dans le vrai navigateur. La copie de la démonstration n'est
// suivie par aucun commit : la vue le dit au lieu de disparaître.
describe('the versions view', () => {
  test('says why it cannot read the changes of a project Git does not follow', async ({
    ecran,
  }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    await ecran.page.locator('.activity-bar .item', { hasText: 'versions' }).click()

    await expect
      .poll(async () =>
        (await ecran.page.locator('.versions-view .empty-note').textContent())?.trim(),
      )
      .toBe('The changes cannot be read: .crypte/fingerprint.json has never been committed.')
    expect(new URL(ecran.page.url()).search).toBe('?changes')
    expect(await ecran.page.locator('.activity-bar .count').count()).toBe(0)
  })
})

// À 1280, la colonne tient dans la grille et le bouton la retire, le canvas
// prenant sa place. Sous 1180 px, elle part fermée et s'ouvre par-dessus le
// canvas, qui garde sa largeur.
describe('the panels below 1180', () => {
  test('fold behind a button, and open over the canvas', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    const colonne = ecran.page.locator('#panels')
    const bouton = ecran.page.locator('.panels-toggle')
    const large = () =>
      ecran.page.locator('.canvas').evaluate((e) => e.getBoundingClientRect().width)
    expect(await colonne.isVisible()).toBe(true)
    const entier = await large()
    await bouton.click()
    await expect.poll(() => colonne.isVisible()).toBe(false)
    expect(await large()).toBeGreaterThan(entier)
    await bouton.click()
    await expect.poll(() => colonne.isVisible()).toBe(true)

    try {
      await ecran.page.setViewportSize({ width: 1024, height: 900 })
      await expect.poll(() => colonne.isVisible()).toBe(false)
      expect(await bouton.isVisible()).toBe(true)
      const avant = await large()

      await bouton.click()
      await expect.poll(() => colonne.isVisible()).toBe(true)
      expect(await large()).toBe(avant)
      await ecran.page.keyboard.press('Escape')
      await expect.poll(() => colonne.isVisible()).toBe(false)
    } finally {
      await ecran.page.setViewportSize({ width: 1280, height: 720 })
    }
  })
})

// Les raccourcis dans le vrai navigateur, sur la page et non dans la preview.
describe('the shortcuts', () => {
  test('shows the preview alone until Escape', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    await ecran.page.locator('main').press('f')
    await expect.poll(() => ecran.page.locator('.nav-column').isVisible()).toBe(false)
    await ecran.page.locator('main').press('Escape')
    await expect.poll(() => ecran.page.locator('.nav-column').isVisible()).toBe(true)
  })
})

// L'option `layout` du noyau (2.4), jugée où elle place la story.
describe('the layout of a story, on screen', () => {
  const placement = async (ecran: Ecran) => {
    const cadre = (await ecran.page.locator('iframe[title="preview"]').boundingBox())!
    const boite = (await ecran.page
      .frameLocator('iframe[title="preview"]')
      .getByText('Nouveau')
      .boundingBox())!
    return {
      gauche: Math.round(boite.x - cadre.x),
      milieu: [
        Math.round(boite.x + boite.width / 2 - cadre.x - cadre.width / 2),
        Math.round(boite.y + boite.height / 2 - cadre.y - cadre.height / 2),
      ],
    }
  }

  // Les trois mises en page, données au catalogue servi et relues au
  // rechargement : `padded` est à 16 px de `fullscreen`.
  test('centres a story by default, pads it, or gives it the whole frame', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    expect((await placement(ecran)).milieu.map((ecart) => Math.abs(ecart) <= 1)).toEqual([
      true,
      true,
    ])

    const entry = ecran.held.catalogue.manifest.entries.find(
      (one) => one.id === 'badge--par-defaut',
    )
    if (entry?.type !== 'story') throw new Error('badge--par-defaut absente du catalogue')
    const gauche = async (layout: string) => {
      entry.options = { layout }
      await ecran.page.reload()
      await expect.poll(ecran.vu).toBe('Nouveau')
      return (await placement(ecran)).gauche
    }
    const plein = await gauche('fullscreen')
    const marge = await gauche('padded')

    expect(marge - plein).toBe(16)
  })

  // Lue dans le module avant le manifeste : une option écrite par décomposition
  // n'arrive pas au manifeste, lu sans exécuter le fichier. Revue de #152.
  test(
    'reads the layout the module declares, spread included',
    { timeout: 60_000 },
    async ({ ecran }) => {
      await expect.poll(ecran.vu).toBe('Nouveau')
      const centre = (await placement(ecran)).gauche
      const file = join(ecran.root, 'stories', 'Badge.tsx')
      writeFileSync(
        file,
        readFileSync(file, 'utf8')
          .replace(
            'export default',
            "const plein = { layout: 'fullscreen' } as const\n\nexport default",
          )
          .replace("'Par défaut': {},", "'Par défaut': { props: {}, options: { ...plein } },"),
      )

      await expect
        .poll(async () => (await placement(ecran)).gauche, { timeout: 45_000 })
        .toBeLessThan(centre / 2)
    },
  )
})

// L'échelle posée sur le document de la preview, jugée où elle se calcule.
describe('the zoom, on screen', () => {
  test('scales the story and keeps the size of its frame', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    // Le badge et non son bloc, qui prend toute la largeur à toute échelle.
    const story = ecran.page.frameLocator('iframe[title="preview"]').getByText('Nouveau')
    const cadre = ecran.page.locator('iframe[title="preview"]')
    const avant = { story: (await story.boundingBox())!, cadre: (await cadre.boundingBox())! }

    await ecran.page.locator('main').press('+')
    await ecran.page.locator('main').press('+')
    await expect
      .poll(async () => (await story.boundingBox())!.width / avant.story.width)
      .toBeCloseTo(1.5, 1)
    expect(await cadre.boundingBox()).toEqual(avant.cadre)
  })

  // Le menu rend le focus à son bouton à la fermeture, en focus visible : un
  // tooltip sur ce bouton revenait après chaque choix. Revue de #149.
  test('reopens no tooltip once a level is chosen', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    await ecran.page.locator('.stage-tools .level').click()
    await ecran.page.getByRole('menuitemradio', { name: '300 %' }).click()
    await new Promise((resolve) => setTimeout(resolve, 800))

    expect(await ecran.page.locator('.stage-tools .level').textContent()).toContain('300 %')
    expect(await ecran.page.locator('.crypte-tooltip').count()).toBe(0)
  })
})

// L'audit de la vue santé dans le vrai navigateur : chaque story de la démo rendue
// en light puis en dark dans la preview cachée, et le vrai plugin a11y qui répond.
describe('the accessibility audit, on screen', () => {
  // Sans un clic : l'audit part seul, une fois la première story rendue.
  test('audits every story in both themes with the a11y plugin, on its own', async ({ ecran }) => {
    await ecran.page.goto(new URL('?health=accessibility', ecran.page.url()).href)

    await expect.poll(() => ecran.page.locator('.cards li').count(), { timeout: 60_000 }).toBe(3)
    expect(await ecran.page.locator('.audit-frame').count()).toBe(0)
    expect(await ecran.page.locator('.status-bar p').first().textContent()).toMatch(
      /^audit of \d+ stories in \d+\.\d s$/,
    )
    // Les valeurs réelles de la démo : la story au rôle inconnu enfreint aria-roles,
    // celle qui lève a sa page. Elles tiennent la forme de `a11y:results`, que
    // le shell lit : un champ renommé dans le plugin fait tomber ces lignes.
    expect(
      (await ecran.page.locator('.cards li').allTextContents()).map((one) =>
        one.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['5 stories without violation', '0 serious violations', '1 critical violation'])
    expect(await ecran.page.locator('.unaudited').count()).toBe(0)
    const ligne = ecran.page.locator('.health-view tbody tr')
    expect(await ligne.count()).toBe(1)
    expect((await ligne.locator('th, td').allTextContents()).map((one) => one.trim())).toEqual([
      'Tag / Rôle inconnu',
      'aria-roles',
      'ARIA roles used must conform to valid values, in light and dark',
      'critical',
    ])
    await ligne.click()
    await expect
      .poll(() => ecran.page.locator('[aria-label="To do"] code.label').allTextContents())
      .toEqual(['span'])
    expect(await ecran.page.locator('.gauge').allTextContents()).toHaveLength(3)

    // La story qui lève, sur la page des rendus en échec, avec son message.
    await ecran.page.locator('.health a', { hasText: 'render errors' }).click()
    const échec = ecran.page.locator('[aria-label="Health, render errors"] tbody tr')
    await expect.poll(() => échec.count()).toBe(1)
    expect(await échec.locator('th').textContent()).toBe('Boom / Échoue au rendu')
  })
})

// Le thème demandé, posé sur la racine de chaque preview par le vrai navigateur :
// la première en light, la seconde en dark, chacune rendant la story (5.2).
describe('the light and dark comparison, on screen', () => {
  test('renders the story in both themes, side by side', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    await ecran.page.getByRole('button', { name: 'Compare light and dark' }).click()

    const racine = (titre: string) =>
      ecran.page
        .frameLocator(`iframe[title="${titre}"]`)
        .locator('html')
        .evaluate((e) => [e.dataset.theme, e.style.colorScheme].join(' '))
    await expect.poll(() => racine('preview, dark')).toBe('dark dark')
    expect(await racine('preview')).toBe('light light')
    await expect
      .poll(() =>
        ecran.page.frameLocator('iframe[title="preview, dark"]').getByText('Nouveau').count(),
      )
      .toBe(1)
  })
})

// Les tokens de `@crypte/ui` et `light-dark()` jugés là où ils se calculent : jsdom
// ne résout aucune couleur.
describe('the theme, on screen', () => {
  test('follows the system, then turns the page dark on t', async ({ ecran }) => {
    const fond = () =>
      ecran.page.evaluate<string>('getComputedStyle(document.documentElement).backgroundColor')
    await expect.poll(ecran.vu).toBe('Nouveau')

    expect(await fond()).toBe('rgb(250, 250, 249)')
    await ecran.page.locator('main').press('t')
    await expect.poll(fond).toBe('rgb(28, 25, 23)')
  })
})

// Les hauteurs des composants Figma (page `core/ui`), traits compris : Figma les
// pose à l'intérieur, une `border` les ajouterait à la boîte.
describe('the components, on screen', () => {
  test('have the heights of their Figma components', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    const hauteur = (selecteur: string) =>
      ecran.page
        .locator(selecteur)
        .first()
        .evaluate((e) => e.getBoundingClientRect().height)

    expect({
      'activity-bar/item': await hauteur('.activity-bar .item'),
      'button lg icon': await hauteur('.activity-bar .icon-button'),
      tab: await hauteur('.tabs button'),
      row: await hauteur('[role=treeitem]'),
      'button md': await hauteur('.actions .copy'),
      'panel/header': await hauteur('[data-plugin="controls"] .head'),
      'panel/body padding': await ecran.page.evaluate<string>(
        `getComputedStyle(document.querySelector('[data-plugin="controls"] .content')).padding`,
      ),
    }).toEqual({
      'activity-bar/item': 48,
      'button lg icon': 32,
      tab: 24,
      row: 24,
      'button md': 28,
      'panel/header': 40,
      'panel/body padding': '12px',
    })

    // Les lignes des tableaux de Figma : un en-tête de 24 px, des articles de 32.
    await ecran.page.goto(new URL('?component=badge', ecran.page.url()).href)
    expect(
      await ecran.page
        .locator('.component-page tr')
        .evaluateAll((rows) => rows.slice(0, 2).map((one) => one.getBoundingClientRect().height)),
    ).toEqual([24, 32])
  })
})

// ⌘K sous macOS, Ctrl+K ailleurs : Playwright choisit selon le système, comme le
// shell selon son navigateur.
describe('the command palette, on screen', () => {
  test('goes to a story by its name, and runs an action from the navigation field', async ({
    ecran,
  }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    const dialogue = ecran.page.getByRole('dialog')

    await ecran.page.locator('main').press('ControlOrMeta+K')
    await dialogue.locator('input').fill('avertissement')
    await dialogue.locator('input').press('Enter')
    await expect.poll(() => new URL(ecran.page.url()).search).toBe('?id=badge--avertissement')
    await expect.poll(() => dialogue.count()).toBe(0)

    // Le bouton de recherche de l'activity bar ouvre la palette, qui affiche les raccourcis.
    await ecran.page.getByRole('button', { name: /^Search or run/ }).click()
    await expect
      .poll(() => dialogue.getByRole('option', { name: 'Full screen F' }).isVisible())
      .toBe(true)
    await dialogue.locator('input').fill('full')
    await dialogue.locator('input').press('Enter')
    await expect.poll(() => ecran.page.locator('.nav-column').isVisible()).toBe(false)
  })
})

// axe-core sur le shell servi, pas sur `apps/shell/dist` : seul le serveur lui
// donne un catalogue, donc un arbre, des panneaux et des pages à juger. Le cadre
// de la preview est exclu, c'est le code de l'utilisateur, que le panneau `a11y`
// juge déjà. Chaque écran dans les deux thèmes, le contraste changeant avec eux.
const axe = createRequire(import.meta.url).resolve('axe-core')

// Chacun avec ce qui prouve qu'il est dessiné : une adresse périmée retombe sur
// la première story sous une alerte, et axe jugerait alors un autre écran.
const ecrans = [
  ['a story', '?id=badge--par-defaut', 'iframe[title="preview"]:visible'],
  ['a component page', '?component=badge', '.component-page'],
  ['a token category', '?tokens=color', '.tokens-view'],
  ['the versions', '?changes', '.versions-view'],
  ['the health', '?health=overview', '.health-view'],
  ['the accessibility audit', '?health=accessibility', '.health-view'],
  ['the command palette', '?id=badge--par-defaut', '[role="dialog"]'],
  ['the zoom menu', '?id=badge--par-defaut', '[role="menu"]'],
] as const

// Les résultats de la palette défilent sans être focalisables : le focus reste
// dans le champ, qui désigne l'option active par `aria-activedescendant` et la
// fait défiler aux flèches. axe ne lit pas ce motif.
const admis = new Set(['the command palette, scrollable-region-focusable: .results'])

describe('accessibility, on screen', () => {
  test.for(['light', 'dark'] as const)('has no axe violation in %s', async (theme, { ecran }) => {
    await ecran.page.emulateMedia({ colorScheme: theme })
    const violations: string[] = []

    for (const [nom, adresse, dessine] of ecrans) {
      await ecran.page.goto(new URL(adresse, ecran.page.url()).href)
      await expect.poll(() => ecran.page.locator('main').count()).toBe(1)
      if (nom === 'the command palette') {
        await ecran.page.locator('main').press('ControlOrMeta+K')
      }
      if (nom === 'the zoom menu') await ecran.page.locator('.stage-tools .level').click()
      await expect.poll(() => ecran.page.locator(dessine).count()).toBe(1)
      expect(await ecran.page.locator('.stale').count()).toBe(0)
      await ecran.page.addScriptTag({ path: axe })
      const trouve = await ecran.page.evaluate(async () => {
        const { violations } = await (
          globalThis as unknown as { axe: typeof import('axe-core') }
        ).axe.run({ exclude: [['iframe']] })
        return violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        )
      })
      violations.push(...trouve.map((v) => `${nom}, ${v}`).filter((v) => !admis.has(v)))
    }

    expect(violations).toEqual([])
  })
})

// Le 1280 sur un corpus réel : des noms longs, et une écriture non latine, que
// la normalisation garde (`tag--активная-…`). Une maquette choisit des libellés
// qui tiennent ; ici, rien ne doit déborder en largeur, sur la page composant
// comme dans le mode changements, servi par une réponse au corpus du même genre.
describe('a long and non-Latin corpus at 1280', () => {
  const CYRILLIQUE = 'Активная кнопка с очень длинным названием для проверки переноса строки'
  const LONG = 'Un nom de story particulièrement long qui ne tient jamais sur une seule ligne'
  const deborde = (ecran: Ecran) =>
    ecran.page.evaluate<
      string[]
    >(`[...document.querySelectorAll('main, .stage, .sidebar, .component-page, .versions-view, table')]
      .filter((e) => e.scrollWidth > e.clientWidth + 1)
      .map((e) => (e.className || e.tagName) + ' ' + e.scrollWidth + '>' + e.clientWidth)`)

  test('overflows nowhere, on the component page or in the versions view', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    expect(ecran.page.viewportSize()?.width).toBe(1280)

    const file = join(ecran.root, 'stories', 'Tag.tsx')
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(
        '    Nue: {},',
        `    Nue: {},\n    '${CYRILLIQUE}': {},\n    '${LONG}': { className: 'une-classe-au-nom-volontairement-tres-long-pour-le-tableau' },`,
      ),
    )
    await expect
      .poll(() => ecran.page.getByRole('treeitem', { name: CYRILLIQUE }).count(), {
        timeout: 30_000,
      })
      .toBe(1)

    await ecran.page.goto(new URL('?component=tag', ecran.page.url()).href)
    await expect.poll(() => ecran.page.locator('.component-page').count()).toBe(1)
    expect(await deborde(ecran)).toEqual([])

    // Par le noyau : la normalisation retire les accents latins, et un identifiant
    // calculé à la main ne trouvait pas sa story, la ligne restant du code nu.
    const id = (nom: string) => storyId(['Tag'], nom)
    await ecran.page.route('**/@crypte/changes.json', (route) =>
      route.fulfill({
        json: {
          from: { ref: 'HEAD', commit: 'abcdef0' },
          tokens: [],
          changes: [
            { kind: 'appeared', id: id(CYRILLIQUE) },
            {
              kind: 'changed',
              id: id(LONG),
              props: {
                before: ['children'],
                after: ['children', 'className', 'unePropAuNomTresLong'],
              },
            },
            {
              kind: 'disappeared',
              id: 'tag--une-story-disparue-au-nom-tout-aussi-long-que-les-autres',
            },
          ],
        },
      }),
    )
    await ecran.page.goto(new URL('?changes', ecran.page.url()).href)
    // Les trois lignes dans la sidebar, et le détail de la plus large : une story
    // changée, son nom suivi de ses props.
    await expect.poll(() => ecran.page.locator('.sidebar li a').count()).toBe(3)
    expect(await deborde(ecran)).toEqual([])
    await ecran.page.locator('.sidebar li a').nth(1).click()
    await expect.poll(() => ecran.page.locator('.versions-view .change').count()).toBe(1)
    expect(await deborde(ecran)).toEqual([])
  }, 60_000)
})

// Couper un enrobage depuis le shell, avec l'adaptateur React : le cadre du `wrap`
// du fichier disparaît, celui de la configuration reste. Le critère de DCJ-204, que
// le cas Vue plus bas tient pour le second adaptateur.
describe('a wrapper turned off', () => {
  test('renders the story without it, and keeps the others', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    const lignes = ecran.page.locator('[aria-label="Wrappers"] .row')
    await expect.poll(() => lignes.allTextContents()).toEqual(['Panel', 'Tone'])
    const preview = ecran.page.frameLocator('iframe[title="preview"]')

    await lignes.nth(1).locator('input').click()

    await expect.poll(() => preview.locator('[data-frame="tone"]').count()).toBe(0)
    expect(await preview.locator('[data-frame="panel"]').count()).toBe(1)
    expect(await ecran.vu()).toBe('Nouveau')
  })
})

// Le second adaptateur, dans le vrai navigateur : la démonstration Vue rend dans
// le même shell, son `wrap` fournit ce que le composant lit par `inject`, et un
// clic fait bouger l'état. Le critère de DCJ-402.
describe('a Vue project', () => {
  test('renders its stories in the same shell, inside their wrapper, under controls', async () => {
    const root = mkdtempSync(join(demoVue, '..', 'tmp-demo-'))
    cpSync(demoVue, root, { recursive: true })
    const started = await startDev(root)
    await started.server.listen()
    const page = await browser.newPage()

    try {
      const address = started.server.httpServer?.address()
      if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')
      await page.goto(`http://localhost:${address.port}/?id=counter--par-dix`)

      const bouton = page.frameLocator('iframe[title="preview"]').locator('button')
      await expect.poll(() => bouton.textContent().catch(() => '')).toBe('10')
      expect(await bouton.getAttribute('data-frame')).toBe('panel')
      await bouton.click()
      await expect.poll(() => bouton.textContent()).toBe('20')

      // Une édition de `controls` garde l'état du composant : l'adaptateur garde sa
      // racine, et le compte ne repart pas de `start`.
      const controles = page.locator('[data-plugin="controls"]')
      await controles.getByLabel('step').fill('5')
      await expect.poll(() => bouton.textContent()).toBe('20')
      await bouton.click()
      await expect.poll(() => bouton.textContent()).toBe('25')

      // Couper son enrobage : le composant perd le contexte qu'il lisait par `inject`.
      await page.locator('[aria-label="Wrappers"] input').click()
      await expect.poll(() => bouton.getAttribute('data-frame')).toBe('no frame')
    } finally {
      await page.close()
      await started.server.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// Le dossier de `crypte build`, servi tel quel par un serveur de fichiers et sous
// un chemin : sans Vite, sans les routes de `crypte dev`, et sans une adresse
// absolue qui tomberait hors du chemin.
describe('a static build, served below a path', () => {
  base('renders a story, mounts the panels and names the wrappers', async () => {
    const root = copie()
    await build(root, () => {})

    const serve = sirv(join(root, BUILD_OUTPUT))
    const server = createServer((request, response) => {
      const missing = () => {
        response.statusCode = 404
        response.end()
      }
      if (!request.url?.startsWith('/sous/')) return missing()
      request.url = request.url.slice('/sous'.length)
      serve(request, response, missing)
    })
    await new Promise<void>((done) => server.listen(0, done))
    const address = server.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')

    const page = await browser.newPage()
    const plaintes: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') plaintes.push(message.text())
    })
    page.on('response', (answer) => {
      if (answer.status() >= 400) plaintes.push(`${answer.status()} ${answer.url()}`)
    })

    try {
      await page.goto(`http://localhost:${address.port}/sous/?id=badge--par-defaut`)

      const rendu = page.frameLocator('iframe[title="preview"]').locator('#root')
      await expect.poll(() => rendu.textContent().catch(() => '')).toContain('Nouveau')
      await expect
        .poll(() => page.locator('[data-plugin="hello"] .body button').first().textContent())
        .toBe('hello, 0 clic(s)')
      // Les noms des fonctions, gardés à la minification : `i` et `a` sinon.
      expect(await page.locator('[aria-label="Wrappers"] code').allTextContents()).toEqual([
        'Panel',
        'Tone',
      ])

      // L'export au format de Storybook : la story de l'adresse, sans shell, et
      // un identifiant inconnu nommé à sa place.
      const seule = await browser.newPage()
      try {
        await seule.goto(
          `http://localhost:${address.port}/sous/iframe.html?id=badge--avertissement`,
        )
        await expect.poll(() => seule.locator('#root').textContent()).toContain('Nouveau')
        await seule.goto(`http://localhost:${address.port}/sous/iframe.html?id=inconnue`)
        await expect
          .poll(() => seule.locator('#crypte-failure').textContent())
          .toBe('unknown story: inconnue')
      } finally {
        await seule.close()
      }
      expect(plaintes).toEqual([])
    } finally {
      await page.close()
      await new Promise((done) => server.close(done))
      rmSync(root, { recursive: true, force: true })
    }
  })
})
