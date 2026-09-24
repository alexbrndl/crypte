import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Manifest, StoryEntry } from '@crypte/core/protocol'
import { describe, expect, test as base } from 'vitest'
import { componentFiles, startDev } from '../src/dev'
import { storiesOf, type Catalogue } from '../src/manifest'
import { MANIFEST_ROUTE } from '../src/serve'

// Ce que le serveur fait des fichiers pendant qu'il tourne. Sur une copie de la
// fixture : ces cas écrivent des fichiers de story, et la fixture est commitée.
//
// La copie reste dans l'espace de travail, pas dans `os.tmpdir()` : hors du
// dépôt, `crypte.config.ts` ne résout plus `@crypte/cli`. Mesuré.
//
// **Une copie et un serveur par cas.** Partagés, ils rendaient chaque cas
// dépendant de ce que ses voisins avaient écrit : le mélange d'ordre a fait
// tomber six cas sur onze, et deux couplages étaient déjà documentés en
// commentaire faute de savoir les retirer. Une fixture les supprime tous, et
// vitest la démonte même si le cas lève.

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixture')

interface Projet {
  root: string
  origin: string
  // Le catalogue que le serveur retient, pour les cas qui n'ont pas besoin de
  // passer par la route.
  retenu: () => string[]
  // Les identifiants que la route sert maintenant.
  noms: () => Promise<string[]>
  // Les entrées de story servies maintenant. Les stories seules : ces cas
  // lisent `props`, `partial` et `source`, qu'une entrée tokens ne porte pas.
  entrees: () => Promise<StoryEntry[]>
  // Le catalogue que le serveur retient, entier : `componentFiles` le prend.
  catalogue: () => Catalogue
  // Les fichiers de composant surveillés en ce moment.
  surveilles: () => string[]
  // Ce que le serveur a dit, depuis le démarrage de ce cas.
  dites: (motif: string) => () => string[]
  // Les rechargements complets envoyés, depuis le démarrage de ce cas.
  rechargements: () => number
}

const test = base.extend<{ projet: Projet }>({
  // Le paramètre vide est la forme que vitest lit pour savoir quelles fixtures
  // initialiser. Le renommer fait collecter zéro test : mesuré. Le lint le
  // signale, et c'est le seul avertissement que ce dépôt accepte sciemment.
  projet: async ({}, use) => {
    const root = mkdtempSync(join(fixture, '..', 'tmp-hot-'))
    cpSync(fixture, root, { recursive: true })

    const lines: string[] = []
    const started = await startDev(root, (line) => lines.push(line))
    await started.server.listen()

    const address = started.server.httpServer?.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')

    const origin = `http://localhost:${address.port}`

    // La forme du catalogue décide du rechargement, donc c'est lui qu'on compte :
    // le shell ne relit le manifeste que sur `ready`, qu'un rechargement émet.
    let reloads = 0
    const sent = started.server.hot.send.bind(started.server.hot)
    started.server.hot.send = ((payload: { type?: string }) => {
      if (payload?.type === 'full-reload') reloads += 1

      return sent(payload as never)
    }) as typeof started.server.hot.send

    const entrees = async () => {
      const manifest = (await fetch(`${origin}${MANIFEST_ROUTE}`).then((answer) =>
        answer.json(),
      )) as Manifest

      return storiesOf(manifest)
    }

    await use({
      root,
      origin,
      retenu: () => storiesOf(started.held.catalogue.manifest).map((entry) => entry.id),
      catalogue: () => started.held.catalogue,
      surveilles: started.watched,
      noms: async () => (await entrees()).map((entry) => entry.id),
      entrees,
      rechargements: () => reloads,
      dites: (motif) => {
        const debut = lines.length

        return () => lines.slice(debut).filter((une) => une.includes(motif))
      },
    })

    await started.server.close()
    rmSync(root, { recursive: true, force: true })
  },
})

const story = (component: string) =>
  [
    `import { ${component} } from '@/components/Badge'`,
    '',
    `export default defineStories(${component})`,
  ].join('\n')

describe('the catalog while the server runs', () => {
  // Le jeu suit le catalogue, il n'est pas figé au démarrage. Mesuré autrement
  // que par les deux cas voisins : sur macOS `fs.watch` sur un fichier est
  // granulaire au **dossier**, donc surveiller `src/components/Badge.jsx` couvre
  // incidemment ses voisins, et une sauvegarde produit des événements tardifs
  // qui relisent le composant pour une autre raison. Les deux font passer un cas
  // qui croit éprouver la resynchronisation. Le jeu surveillé se lit donc
  // directement.
  test('watches a component a story starts citing', async ({ projet }) => {
    const autre = join(projet.root, 'src', 'autre', 'Autre.jsx')

    mkdirSync(dirname(autre), { recursive: true })
    writeFileSync(autre, 'export const Autre = () => null\n')

    // Le fichier est sur le disque, et une reconstruction est passée sans le
    // prendre. Affirmé avant qu'il existe, « pas surveillé » serait vrai quelle
    // que soit la largeur du jeu.
    writeFileSync(
      join(projet.root, 'stories', 'Fantome.js'),
      "import { Fantome } from 'introuvable'\n\nexport default defineStories(Fantome)\n",
    )
    await expect.poll(projet.noms).toContain('fantome--default')

    expect(projet.surveilles()).not.toContain(autre)

    writeFileSync(
      join(projet.root, 'stories', 'Autre.js'),
      "import { Autre } from '@/autre/Autre'\n\nexport default defineStories(Autre)\n",
    )

    await expect.poll(projet.surveilles).toContain(autre)
  })

  // Et il lâche ce qui n'est plus cité : gardés, les surveillants s'accumulent
  // pour la durée du serveur, un par composant qu'une story a cité un jour.
  test('stops watching a component no story cites anymore', async ({ projet }) => {
    const badge = join(projet.root, 'src', 'components', 'Badge.jsx')

    expect(projet.surveilles()).toContain(badge)

    rmSync(join(projet.root, 'stories', 'Badge.js'))

    await expect.poll(projet.surveilles).not.toContain(badge)
  })

  // Un composant que le producteur n'a pas su résoudre : la section 8 dit qu'il
  // garde l'identifiant que la story a écrit, donc le chemin ne désigne aucun
  // fichier. `fs.watch` lève dessus, et une levée ici arrêterait la
  // reconstruction, donc le serveur, sur une story parfaitement ordinaire.
  test('does not throw on a component nothing resolves', async ({ projet }) => {
    writeFileSync(
      join(projet.root, 'stories', 'Fantome.js'),
      "import { Fantome } from 'introuvable'\n\nexport default defineStories(Fantome)\n",
    )

    await expect.poll(projet.noms).toContain('fantome--default')

    // Le catalogue le cite, et aucun surveillant ne le porte.
    const cité = componentFiles(projet.root, projet.catalogue()).find((one) =>
      one.includes('introuvable'),
    )

    expect(cité, 'le catalogue ne cite pas le composant irrésolu').toBeDefined()
    expect(projet.surveilles()).not.toContain(cité)
  })

  // Le piège de la surveillance : la prendre trop large reconstruit le catalogue
  // à chaque frappe dans n'importe quel fichier du projet. Ce cas tient l'autre
  // moitié du contrat, ce qui n'est **pas** surveillé.
  test('watches only the components a story cites', async ({ projet }) => {
    const cités = componentFiles(projet.root, projet.catalogue())

    expect(cités).toEqual([
      join(projet.root, 'src', 'components', 'Badge.jsx'),
      join(projet.root, 'src', 'components', 'checkout', 'OrderSummary.jsx'),
    ])

    // Ce `toEqual` tient aussi le dédoublonnage : `OrderSummary` porte trois
    // stories, donc sans le `Set` la liste en rendrait quatre. Et il exclut à
    // lui seul `entry.jsx` et `src/assets.js`, que le projet porte et qu'aucune
    // story ne cite.
    //
    // Mais il ne tient que `componentFiles`, projection pure du catalogue. La
    // régression que ce cas nomme vit en aval, dans `syncComponents` : le jeu
    // réellement surveillé se lit donc lui aussi, et en entier plutôt qu'en
    // absences, pour attraper le surveillant récursif posé sur l'ancêtre commun.
    expect(projet.surveilles()).toEqual(cités)
  })

  // Une sauvegarde atomique, temporaire puis `rename` par-dessus, est ce que
  // font par défaut vim, la « safe write » de JetBrains et `files.atomicSave` de
  // VS Code. `fs.watch` sur un fichier suit l'inode : sans réouverture, le
  // composant devient muet pour la durée du serveur, et seul un redémarrage
  // répare. Mesuré hors dépôt : la sauvegarde suivant l'atomique est manquée,
  // et toutes celles d'après.
  //
  // **Ce cas ne discrimine que là où `fs.watch` est par inode**, donc en
  // intégration continue, qui tourne sur `ubuntu-latest`. Sur macOS il reste
  // vert même sans la réouverture : mesuré, c'est le surveillant d'un **autre**
  // composant qui capte l'écriture, les surveillants de fichier s'y déclenchant
  // entre voisins. La réouverture elle-même est tenue sur toutes les plates-
  // formes par `watch.test.ts` ; ce cas-ci éprouve le serveur entier.
  test('survives an atomic save of the component', async ({ projet }) => {
    const composant = join(projet.root, 'src', 'components', 'Badge.jsx')
    const temporaire = join(projet.root, 'src', 'components', '.Badge.jsx.tmp')

    writeFileSync(temporaire, 'export const Badge = () => null\n')
    renameSync(temporaire, composant)

    // Le surveillant doit être **rouvert**, pas seulement avoir vu le `rename`,
    // et c'est l'édition d'après qui le dit : `surveilles()` ne distingue rien,
    // la clé ne quittant la carte que le temps du `reopen`, qui est synchrone.
    //
    // Laisser d'abord retomber la reconstruction que le `rename` déclenche,
    // sinon elle relit le composant et l'édition d'après ne mesure rien.
    await expect.poll(async () => (await projet.entrees()).length).toBeGreaterThan(0)
    await new Promise((resolve) => setTimeout(resolve, 300))

    writeFileSync(composant, "export const Badge = ({ apres = 'oui' }) => null\n")

    await expect
      .poll(
        async () => (await projet.entrees()).find((one) => one.id === 'badge--default')?.details,
      )
      .toHaveProperty('apres')
  })

  // Une ligne qui reste dite pour toujours laisse la deuxième occurrence de la
  // même faute passer en silence, ce qui est le silence que ce lot ferme.
  test('reports again what a repaired file breaks again', async ({ projet }) => {
    const reparees = projet.dites('Reparee.js')
    const cassee = join(projet.root, 'stories', 'Reparee.js')

    writeFileSync(cassee, 'export default 12')
    await expect.poll(() => reparees().length).toBe(1)

    writeFileSync(cassee, story('Badge'))
    await expect.poll(projet.noms).toContain('reparee--default')

    writeFileSync(cassee, 'export default 12')
    await expect.poll(() => reparees().length).toBe(2)
  })

  // Deux fichiers du même dossier au même nom de base portent le même
  // identifiant, ce qu'un `crypte dev` rencontre pendant qu'on convertit un
  // fichier. La reconstruction lève, et garder le dernier catalogue bon est la
  // différence entre une sauvegarde qui clignote et un serveur qui s'arrête.
  test('keeps the catalog when the rebuild fails', async ({ projet }) => {
    const before = projet.retenu()
    const echecs = projet.dites('keeping the last good one')

    writeFileSync(join(projet.root, 'stories', 'Badge.jsx'), story('Badge'))

    // La ligne d'échec plutôt qu'un délai : sous charge, une attente plate
    // laisserait le cas conclure avant que la reconstruction ait eu lieu.
    await expect.poll(() => echecs().length).toBeGreaterThan(0)

    // Le catalogue retenu par le serveur, pas celui que la route sert : la ligne
    // d'échec est écrite dans la même reconstruction, donc l'état est déjà
    // décidé quand elle paraît. Par la route, le cas ne voyait le catalogue
    // gardé que par chance : mesuré.
    expect(projet.retenu()).toEqual(before)
  })

  // L'empreinte suit les stories pendant la session : `crypte check` échoue sur
  // une empreinte en retard, et une story ajoutée sans redémarrer la laissait
  // telle qu'au démarrage.
  test('rewrites the fingerprint when a story changes', async ({ projet }) => {
    writeFileSync(join(projet.root, 'stories', 'Tardive.js'), story('Badge'))

    await expect
      .poll(() => readFileSync(join(projet.root, '.crypte', 'fingerprint.json'), 'utf8'))
      .toContain('tardive--default')
  })

  // Le module virtuel de l'entrée nomme ses imports un par un : sans
  // invalidation il resservirait la liste d'avant, donc une story visible dans
  // l'arbre et introuvable au rendu.
  test('rewrites the preview entry after an addition', async ({ projet }) => {
    writeFileSync(join(projet.root, 'stories', 'Tardive.js'), story('Badge'))
    await expect.poll(projet.noms).toContain('tardive--default')

    const source = await fetch(`${projet.origin}/@crypte/preview.js`).then((answer) =>
      answer.text(),
    )

    expect(source).toContain('Tardive.js')
  })
})

// La forme du catalogue décide du rechargement, et le shell ne lit `skipped` ni
// `partial` que sur `ready`, qu'un rechargement émet. Sans ces deux champs dans
// la forme, les deux signaux du lot 5c n'apparaissaient qu'après un rechargement
// à la main : trouvé en revue, `DCJ-217`.
describe('what triggers a reload', () => {
  test('reloads when an added file is unreadable', async ({ projet }) => {
    const avant = projet.rechargements()

    writeFileSync(
      join(projet.root, 'stories', 'Cassee.js'),
      "import { Badge } from '@/components/Badge'\nconst tout = {}\nexport default defineStories(Badge, { stories: tout })\n",
    )

    await expect.poll(() => projet.rechargements()).toBeGreaterThan(avant)
  })

  test('reloads when an existing story becomes partial', async ({ projet }) => {
    const file = join(projet.root, 'stories', 'Badge.js')
    const avant = projet.rechargements()

    writeFileSync(
      file,
      `import { Badge } from '@/components/Badge'
const base = { tone: 'warning' }
export default defineStories(Badge, { props: { ...base, size: 'lg' } })
`,
    )

    await expect.poll(async () => (await projet.entrees())[0]?.partial).toContain('...base')
    expect(projet.rechargements()).toBeGreaterThan(avant)
  })

  // Et le contraire, qui est ce que la forme protège : éditer une valeur de prop
  // reste une mise à jour à chaud.
  test('does not reload when a prop value changes', async ({ projet }) => {
    const file = join(projet.root, 'stories', 'Badge.js')

    writeFileSync(
      file,
      "import { Badge } from '@/components/Badge'\nexport default defineStories(Badge, { props: { tone: 'calm' } })\n",
    )
    await expect.poll(async () => (await projet.entrees())[0]?.props).toContain('tone')

    const avant = projet.rechargements()

    writeFileSync(
      file,
      "import { Badge } from '@/components/Badge'\nexport default defineStories(Badge, { props: { tone: 'warning' } })\n",
    )

    // Attendre la reconstruction par un signal, pas par un délai : `source`
    // change et n'est pas dans la forme, donc il dit que le catalogue a été relu
    // sans dire quoi que ce soit du rechargement.
    await expect.poll(async () => (await projet.entrees())[0]?.source).toContain('warning')

    expect(projet.rechargements()).toBe(avant)
  })
})
