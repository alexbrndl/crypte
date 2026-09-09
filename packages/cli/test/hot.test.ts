import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
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
// Voir docs/internal/architecture.md.

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

describe('le catalogue pendant que le serveur tourne', () => {
  test('sert le catalogue du démarrage', async ({ projet }) => {
    expect(await projet.noms()).toContain('badge--default')
  })

  // La forme décide du rechargement, jamais de la fraîcheur du catalogue :
  // éditer les props d'une story ne change pas l'arbre, et rendre la main ici
  // servait les props d'avant l'édition. Mesuré.
  test('sert les props à jour même quand l’arbre ne bouge pas', async ({ projet }) => {
    const file = join(projet.root, 'stories', 'Badge.js')
    const before = readFileSync(file, 'utf8')

    writeFileSync(
      file,
      before.replace(
        'defineStories(Badge)',
        "defineStories(Badge, { props: { tone: 'warning' } })",
      ),
    )

    await expect
      .poll(async () => (await projet.entrees()).find((one) => one.id === 'badge--default')?.props)
      .toContain('tone')
  })

  // `details` est lu dans le fichier du **composant**, qui est hors du dossier
  // des stories. Sans surveillance de ces fichiers-là, l'utilisateur voit une
  // table de props fausse et le geste qui la répare, toucher la story, n'a
  // aucun rapport visible avec la cause. `DCJ-280`.
  test('rafraîchit details quand le composant change, sans toucher la story', async ({
    projet,
  }) => {
    const detailsDe = async () =>
      (await projet.entrees()).find((one) => one.id === 'badge--default')?.details

    // Le composant de la fixture ne déclare aucune prop.
    expect(await detailsDe()).toEqual({})

    const composant = join(projet.root, 'src', 'components', 'Badge.jsx')
    const avant = readFileSync(composant, 'utf8')

    writeFileSync(composant, "export const Badge = ({ label = 'none' }) => null\n")
    expect(readFileSync(composant, 'utf8')).not.toBe(avant)

    await expect.poll(detailsDe).toHaveProperty('label')
  })

  // Le jeu suit le catalogue, il n'est pas figé au démarrage. Mesuré autrement
  // que par les deux cas voisins : sur macOS `fs.watch` sur un fichier est
  // granulaire au **dossier**, donc surveiller `src/components/Badge.jsx` couvre
  // incidemment ses voisins, et une sauvegarde produit des événements tardifs
  // qui relisent le composant pour une autre raison. Les deux font passer un cas
  // qui croit éprouver la resynchronisation. Le jeu surveillé se lit donc
  // directement.
  test('surveille un composant qu’une story se met à citer', async ({ projet }) => {
    const autre = join(projet.root, 'src', 'autre', 'Autre.jsx')

    expect(projet.surveilles()).not.toContain(autre)

    mkdirSync(dirname(autre), { recursive: true })
    writeFileSync(autre, 'export const Autre = () => null\n')
    writeFileSync(
      join(projet.root, 'stories', 'Autre.js'),
      "import { Autre } from '@/autre/Autre'\n\nexport default defineStories(Autre)\n",
    )

    await expect.poll(projet.surveilles).toContain(autre)
  })

  // Et il lâche ce qui n'est plus cité : gardés, les surveillants s'accumulent
  // pour la durée du serveur, un par composant qu'une story a cité un jour.
  test('cesse de surveiller un composant qu’aucune story ne cite plus', async ({ projet }) => {
    const badge = join(projet.root, 'src', 'components', 'Badge.jsx')

    expect(projet.surveilles()).toContain(badge)

    rmSync(join(projet.root, 'stories', 'Badge.js'))

    await expect.poll(projet.surveilles).not.toContain(badge)
  })

  // Un composant que le producteur n'a pas su résoudre : la section 8 dit qu'il
  // garde l'identifiant que la story a écrit, donc le chemin ne désigne aucun
  // fichier. `fs.watch` lève dessus, et une levée ici arrêterait la
  // reconstruction, donc le serveur, sur une story parfaitement ordinaire.
  test('ne lève pas sur un composant que rien ne résout', async ({ projet }) => {
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
  test('ne surveille que les composants qu’une story cite', async ({ projet }) => {
    const cités = componentFiles(projet.root, projet.catalogue())

    expect(cités).toEqual([
      join(projet.root, 'src', 'components', 'Badge.jsx'),
      join(projet.root, 'src', 'components', 'checkout', 'OrderSummary.jsx'),
    ])

    // Ce `toEqual` tient aussi le dédoublonnage : `OrderSummary` porte trois
    // stories, donc sans le `Set` la liste en rendrait quatre.
    //
    // `entry.jsx` et `src/assets.js` sont dans le projet et cités par aucune
    // story : les surveiller ferait relire l'arbre pour rien.
    expect(cités).not.toContain(join(projet.root, 'entry.jsx'))
    expect(cités).not.toContain(join(projet.root, 'src', 'assets.js'))
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
  // entre voisins. Le voir passer en local ne dit donc rien, et ce n'est pas une
  // raison de le simplifier.
  test('survit à une sauvegarde atomique du composant', async ({ projet }) => {
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

  // Vite ne surveille que les fichiers de son graphe de modules : la
  // surveillance est donc la nôtre, et elle suit le chemin qu'on lui donne,
  // lien symbolique compris.
  test('reconstruit sur une racine derrière un lien symbolique', async ({ projet }) => {
    const link = `${projet.root}-lien`
    symlinkSync(projet.root, link)

    const derriere = await startDev(link)
    await derriere.server.listen()

    try {
      writeFileSync(join(link, 'stories', 'Liee.js'), story('Badge'))

      await expect
        .poll(() => derriere.held.catalogue.manifest.entries.map((one) => one.id))
        .toContain('liee--default')
    } finally {
      await derriere.server.close()
      rmSync(link, { force: true })
    }
  })

  // Un fichier que le lecteur cesse de lire disparaît de l'arbre, et l'écran se
  // recharge : sans une ligne, l'auteur voit sa story partir sans savoir
  // pourquoi. C'est le silence que le lot 4 a fermé, rouvert par l'édition.
  test('dit ce qu’un fichier de story a cessé de produire', async ({ projet }) => {
    const muettes = projet.dites('Muette.js')

    writeFileSync(join(projet.root, 'stories', 'Muette.js'), 'export default 12')

    await expect.poll(muettes).not.toEqual([])
  })

  // Répétée à chaque frappe, la liste entière enterrerait ce qui vient
  // d'apparaître.
  test('ne répète pas ce qu’il a déjà dit', async ({ projet }) => {
    const muettes = projet.dites('Muette.js')

    writeFileSync(join(projet.root, 'stories', 'Muette.js'), 'export default 12')
    await expect.poll(() => muettes().length).toBe(1)

    writeFileSync(join(projet.root, 'stories', 'Autre.js'), story('Badge'))
    await expect.poll(projet.noms).toContain('autre--default')

    expect(muettes()).toHaveLength(1)
  })

  // Une ligne qui reste dite pour toujours laisse la deuxième occurrence de la
  // même faute passer en silence, ce qui est le silence que ce lot ferme.
  test('redit ce qu’un fichier réparé casse à nouveau', async ({ projet }) => {
    const reparees = projet.dites('Reparee.js')
    const cassee = join(projet.root, 'stories', 'Reparee.js')

    writeFileSync(cassee, 'export default 12')
    await expect.poll(() => reparees().length).toBe(1)

    writeFileSync(cassee, story('Badge'))
    await expect.poll(projet.noms).toContain('reparee--default')

    writeFileSync(cassee, 'export default 12')
    await expect.poll(() => reparees().length).toBe(2)
  })

  // Reconstruire lève ici, donc rien ne remplace le catalogue : le dire est la
  // différence entre un arbre qui ne bouge plus et un arbre qui explique.
  test('dit qu’une reconstruction a échoué', async ({ projet }) => {
    const echecs = projet.dites('keeping the last good one')

    writeFileSync(join(projet.root, 'stories', 'Badge.jsx'), story('Badge'))

    await expect.poll(echecs).not.toEqual([])
  })

  // La route lit le catalogue à chaque requête. Capturé au démarrage, il
  // laisserait le shell sur l'arbre d'il y a une heure.
  test('fait apparaître un fichier de story ajouté', async ({ projet }) => {
    writeFileSync(join(projet.root, 'stories', 'Ajoutee.js'), story('Badge'))

    await expect.poll(projet.noms).toContain('ajoutee--default')
  })

  test('fait disparaître un fichier de story retiré', async ({ projet }) => {
    const partante = join(projet.root, 'stories', 'Partante.js')

    writeFileSync(partante, story('Badge'))
    await expect.poll(projet.noms).toContain('partante--default')

    rmSync(partante)

    await expect.poll(projet.noms).not.toContain('partante--default')
  })

  // Deux fichiers du même dossier au même nom de base portent le même
  // identifiant, ce qu'un `crypte dev` rencontre pendant qu'on convertit un
  // fichier. La reconstruction lève, et garder le dernier catalogue bon est la
  // différence entre une sauvegarde qui clignote et un serveur qui s'arrête.
  test('garde le catalogue quand la reconstruction échoue', async ({ projet }) => {
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

  // Le module virtuel de l'entrée nomme ses imports un par un : sans
  // invalidation il resservirait la liste d'avant, donc une story visible dans
  // l'arbre et introuvable au rendu.
  test('réécrit l’entrée de la preview après un ajout', async ({ projet }) => {
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
describe('ce qui déclenche un rechargement', () => {
  test('recharge quand un fichier ajouté n’est pas lisible', async ({ projet }) => {
    const avant = projet.rechargements()

    writeFileSync(
      join(projet.root, 'stories', 'Cassee.js'),
      "import { Badge } from '@/components/Badge'\nconst tout = {}\nexport default defineStories(Badge, { stories: tout })\n",
    )

    await expect.poll(() => projet.rechargements()).toBeGreaterThan(avant)
  })

  test('recharge quand une story existante devient partielle', async ({ projet }) => {
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
  test('ne recharge pas quand une valeur de prop change', async ({ projet }) => {
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

// La disparition, l'autre moitié : un fichier qui produisait des stories et n'en
// produit plus le dit, ce que le lecteur seul ne peut pas savoir puisqu'il juge
// un fichier à la fois. Sa raison devient certaine, donc elle atteint le shell,
// et elle **dure** : une première version ne survivait pas à la reconstruction
// suivante, donc le premier enregistrement sans rapport retirait le bandeau.
describe('un fichier qui cesse de produire', () => {
  test('le dit au shell, et le redit à la reconstruction suivante', async ({ projet }) => {
    const file = join(projet.root, 'stories', 'Badge.js')

    // Un composant en export par défaut : le lecteur ne le tiendrait que pour
    // une supposition, donc le shell ne le verrait pas sans le passé du fichier.
    writeFileSync(file, 'export default function Badge() { return null }\n')

    const dit = async () =>
      (
        (await fetch(`${projet.origin}${MANIFEST_ROUTE}`).then((answer) =>
          answer.json(),
        )) as Manifest
      ).skipped?.map((one) => `${one.file} : ${one.reason}`) ?? []

    // La disparition mène, la raison propre du fichier suit : « no default export
    // calling defineStories » seul se lit comme un utilitaire, et ce fichier
    // était une story il y a une seconde.
    await expect
      .poll(dit)
      .toContain(
        'stories/Badge.js : this file no longer produces any story: no default export calling defineStories',
      )

    // Un enregistrement sans rapport : le bandeau doit rester.
    writeFileSync(join(projet.root, 'stories', 'Autre.js'), story('Badge'))
    await expect.poll(projet.noms).toContain('autre--default')

    expect((await dit()).some((une) => une.startsWith('stories/Badge.js'))).toBe(true)
  })
})
