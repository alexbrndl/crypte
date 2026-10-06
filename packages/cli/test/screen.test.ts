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
import type { ViteDevServer } from 'vite'
import { startDev, type Started } from '../src/dev'
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
        server: started.server,
        held: started.held,
        navigations: () => navigations,
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

  // Ce que React rafraîchit lui-même : le composant est repris par Fast Refresh,
  // pas par le chemin chaud de l'entrée.
  test('refreshes the displayed story when its component changes', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    await ecran.page.getByRole('treeitem', { name: 'Libellé long' }).click()
    await expect.poll(ecran.vu).toBe('Vérification en cours')

    const file = join(ecran.root, 'src', 'components', 'Badge.tsx')
    writeFileSync(file, readFileSync(file, 'utf8').replace('{label}', '{`${label} !`}'))

    const avant = ecran.navigations()

    await expect.poll(ecran.vu).toBe('Vérification en cours !')

    // La story affichée n'a pas changé : c'est tout l'enjeu, un rechargement qui
    // ramène à la première story fait perdre sa place à chaque frappe.
    await expect
      .poll(() =>
        ecran.page.getByRole('treeitem', { name: 'Libellé long' }).getAttribute('aria-selected'),
      )
      .toBe('true')

    expect(ecran.navigations()).toBe(avant)
  })

  // Le fichier de story n'exporte aucun composant, donc Fast Refresh ne s'en
  // saisit pas : sans le chemin chaud de l'entrée, Vite ne trouve personne pour
  // accepter et recharge le cadre. Mesuré, c'est ce cas et non le précédent qui
  // éprouve `hot`.
  test('refreshes a story’s props without reloading the frame', async ({ ecran }) => {
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
    await expect.poll(() => chiffres.count()).toBe(7)

    expect(await chiffres.allInnerTexts()).toEqual([
      expect.stringMatching(/^Shell \d+\.\d kB$/),
      expect.stringMatching(/^First render \d+ ms$/),
      'tokens 0.0 kB',
      expect.stringMatching(/^controls \d\.\d kB$/),
      expect.stringMatching(/^a11y 1\d\d\.\d kB$/),
      expect.stringMatching(/^hello \d\.\d kB$/),
      expect.stringMatching(/^status \d\.\d kB$/),
    ])
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
      .toEqual(['controls', 'a11y', 'hello', 'status'])
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

  test('renders the story with what is typed, without remounting it', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    await expect
      .poll(() => panneau(ecran.page).locator('label span').allTextContents())
      .toEqual(['label', 'tone'])

    // Une marque sur le nœud rendu : un composant remonté la perdrait. C'est la
    // mesure qui garde `update-overrides` en réserve (DCJ-214).
    await cadre(ecran.page)
      .locator('#root span')
      .evaluate((un) => un.setAttribute('data-marque', 'gardée'))

    await panneau(ecran.page).locator('input[type="text"]').fill('Bonjour')
    await expect.poll(ecran.vu).toBe('Bonjour')

    await panneau(ecran.page).locator('select').selectOption({ label: 'warning' })
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
    const navigations = ecran.navigations()

    await cadre(ecran.page)
      .locator('#root [role="etiquette"]')
      .evaluate((un) => un.removeAttribute('role'))
    await corps.getByRole('button', { name: 'Run the analysis again', exact: true }).click()

    await expect.poll(() => raison(ecran.page)).toMatch(/no violation$/)
    expect(ecran.navigations()).toBe(navigations)
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
    const navigations = ecran.navigations()

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
    expect(ecran.navigations()).toBe(navigations)
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

// Les familles que `@crypte/tokens` lit dans la démonstration : le critère de DCJ-338.
describe('the tokens page', () => {
  test('lists the four families, and opens one from its address', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')
    const familles = ecran.page.locator('nav [role="treeitem"].tokens .name')
    await expect
      .poll(() => familles.allTextContents())
      .toEqual(['color', 'radius', 'size', 'space'])

    const origin = new URL(ecran.page.url()).origin
    await ecran.page.goto(`${origin}/?id=tokens--color`)

    const page = ecran.page.locator('.tokens-page')
    await expect.poll(() => page.locator('h2').textContent()).toBe('color')
    expect(await page.locator('thead th').allTextContents()).toEqual(['Token', 'default', 'dark'])
    expect(await page.locator('tbody tr').count()).toBe(4)
  })
})

// Le mode changements dans le vrai navigateur. La copie de la démonstration n'est
// suivie par aucun commit : le mode le dit au lieu de disparaître.
describe('the changes mode', () => {
  test('says why it cannot read the changes of a project Git does not follow', async ({
    ecran,
  }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    await ecran.page.locator('nav .changes-entry').click()

    await expect
      .poll(async () => (await ecran.page.locator('.changes-page .note').textContent())?.trim())
      .toBe('The changes cannot be read: .crypte/fingerprint.json has never been committed.')
    expect(new URL(ecran.page.url()).search).toBe('?changes')
    expect(await ecran.page.locator('nav .changes-entry .counter').count()).toBe(0)
  })
})

// Les raccourcis dans le vrai navigateur, sur la page et non dans la preview.
describe('the shortcuts', () => {
  test('steps to the next story, and shows the preview alone until Escape', async ({ ecran }) => {
    await expect.poll(ecran.vu).toBe('Nouveau')

    expect(new URL(ecran.page.url()).search).toBe('?id=badge--par-defaut')
    await ecran.page.locator('main').press(']')
    await expect.poll(() => new URL(ecran.page.url()).search).toBe('?id=badge--avertissement')

    await ecran.page.locator('main').press('f')
    await expect.poll(() => ecran.page.locator('main > nav').isVisible()).toBe(false)
    await ecran.page.locator('main').press('Escape')
    await expect.poll(() => ecran.page.locator('main > nav').isVisible()).toBe(true)
  })
})
