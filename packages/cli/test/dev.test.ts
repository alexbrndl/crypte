import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startDev, type Started } from '../src/dev'
import { loadProject } from '../src/project'
import { MANIFEST_ROUTE, PREVIEW_ENTRY, PREVIEW_PAGE, previewEntry } from '../src/serve'

// Ce que `crypte dev` sert vraiment, mesuré sur un serveur qui écoute.
// Voir docs/internal/architecture.md.

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixture')

describe('crypte dev', () => {
  let started: Started
  let origin: string

  beforeAll(async () => {
    started = await startDev(fixture)
    await started.server.listen()

    const address = started.server.httpServer?.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')

    origin = `http://localhost:${address.port}`
  }, 30_000)

  afterAll(async () => {
    await started?.server.close()
  })

  const get = async (path: string) => {
    const answer = await fetch(`${origin}${path}`)

    return { status: answer.status, body: await answer.text() }
  }

  it('sert le shell préconstruit à la racine', async () => {
    const { status, body } = await get('/')

    expect(status).toBe(200)
    expect(body).toContain('<div id="app">')
  })

  // La page de la preview appartient au CLI, pas au projet : l'écrire dans le
  // projet y laisserait un fichier que personne n'a demandé.
  it('sert une page de preview dont le seul script est son entrée', async () => {
    const { status, body } = await get(PREVIEW_PAGE)

    expect(status).toBe(200)
    expect(body).toContain('<div id="root">')
    expect(body).toContain(PREVIEW_ENTRY)
  })

  // Le projet a sa propre `index.html`, comme tout vrai projet. Sans
  // `appType: 'custom'`, le repli de Vite la sert pour toute URL inconnue, donc
  // une faute de frappe rendrait la page de l'application au lieu d'un 404.
  it('ne sert jamais la page du projet à la place d’une route inconnue', async () => {
    const { status, body } = await get('/pas-une-route')

    expect(status).toBe(404)
    expect(body).not.toContain('la page du projet')
  })

  it('sert le catalogue depuis la mémoire, pas depuis le fichier écrit', async () => {
    const { status, body } = await get(MANIFEST_ROUTE)

    expect(status).toBe(200)
    expect(JSON.parse(body)).toEqual(started.held.catalogue.manifest)
  })

  // L'entrée passe par le pipeline du projet : ce qui sort n'est plus la source
  // écrite, et c'est la preuve que la preview est compilée chez l'utilisateur.
  it('compile l’entrée de la preview avec le Vite du projet', async () => {
    const { status, body } = await get(PREVIEW_ENTRY)

    expect(status).toBe(200)
    expect(body).toContain('createPreviewChannel')
    expect(body).not.toContain('import.meta.glob')
  })
})

const demo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'demo')

// `loadProject` nomme les fichiers dont la configuration dépend, et un projet
// peut déclarer un `tsconfig.json` qu'il n'a pas. Surveiller un fichier absent
// lève, donc démarrer échouait sur un projet parfaitement valide.
describe('les fichiers surveillés', () => {
  it('démarre même quand un fichier surveillé n’existe pas', async () => {
    const project = await loadProject(fixture)

    expect(project.watch.some((file) => !existsSync(file))).toBe(true)
  })
})

// Le chemin absolu du dépôt, remplacé par un repère : sinon l'instantané ne vaut
// que sur la machine qui l'a écrit.
const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const sansRacine = (source: string) => source.replaceAll(racine, '<racine>')

describe('l’entrée de la preview', () => {
  // L'entrée entière, dans un fichier que la revue lit comme un diff.
  //
  // Elle remplace six assertions par sous-chaîne sur cette même source. Une
  // sous-chaîne passe dès que le texte la contient, pour n'importe quelle
  // raison ; un instantané compare tout, donc il ne peut pas passer pour la
  // mauvaise raison. Il se met à jour par `vp test -u`, et sa mise à jour se
  // relit.
  it('rend une entrée que la revue lit en entier', async () => {
    const source = previewEntry(await loadProject(fixture), ['stories/Gardee.tsx'])

    // La racine du dépôt est remplacée : l'entrée porte le chemin absolu de la
    // feuille de style, donc l'instantané ne vaudrait que sur cette machine.
    await expect(sansRacine(source)).toMatchFileSnapshot('./snapshots/preview-entry.js')
  })

  // Le demo porte un adaptateur importé, la fixture un objet écrit sur place :
  // les deux formes que la section 1.5 autorise.
  it('reprend l’import dont un adaptateur construit se sert', async () => {
    const source = previewEntry(await loadProject(demo))

    await expect(sansRacine(source)).toMatchFileSnapshot('./snapshots/preview-entry-demo.js')

    expect(source).not.toContain('crypte.config.ts')
  })

  // L'adaptateur vient de la configuration du projet, jamais d'un nom de paquet
  // deviné depuis `adapter.name` : envelopper un adaptateur casserait la devinette.
  it('importe l’adaptateur depuis la configuration du projet', () => {
    const source = previewEntry({ root: fixture, config: { stories: 'stories' } } as never)

    // La configuration n'est jamais importée : elle peut porter des plugins
    // Vite, donc du code Node, et la preview échouerait avant d'ouvrir le canal,
    // donc sans jamais pouvoir dire pourquoi.
    expect(source).not.toContain('crypte.config.ts')

    // Seuls les imports que l'expression nomme. Emporter les autres remettrait
    // exactement ce que lire au lieu d'importer sert à laisser dehors.
    expect(source).not.toContain('defineConfig')
    expect(source).not.toContain('@crypte/cli')
  })

  // Un fichier que le lecteur a écarté ne doit pas être importé : il ferait
  // échouer l'entrée au chargement, donc avant l'ouverture du canal, donc sans
  // que le shell puisse rien afficher.
  it('n’importe que les fichiers qui ont produit une entrée', () => {
    const source = previewEntry({ root: fixture, config: { stories: 'stories' } } as never, [
      'stories/Gardee.tsx',
    ])

    expect(source).toContain('import * as story0 from "/stories/Gardee.tsx"')
    expect(source).not.toContain('import.meta.glob')
    expect(source).not.toContain('Ecartee')
  })

  // Un nom de fichier est une donnée, pas du code : interpolé brut, une
  // apostrophe ferme la chaîne et le reste du nom devient du JavaScript.
  it('échappe le nom du fichier dans l’import', () => {
    const source = previewEntry({ root: fixture, config: { stories: 'stories' } } as never, [
      String.raw`stories/L'"Ecart.tsx`,
    ])

    expect(source).toContain(String.raw`import * as story0 from "/stories/L'\"Ecart.tsx"`)
  })

  it('charge la feuille de style déclarée, et rien quand il n’y en a pas', () => {
    const withCss = previewEntry({
      root: fixture,
      config: { stories: 'stories', css: 'src/styles/app.css' },
    } as never)
    const without = previewEntry({ root: fixture, config: { stories: 'stories' } } as never)

    expect(withCss).toContain('app.css')
    expect(without).not.toContain('app.css')
  })
})
