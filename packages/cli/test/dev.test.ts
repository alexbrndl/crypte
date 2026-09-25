import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, test as base } from 'vitest'
import { dev, startDev, type Started, type Running } from '../src/dev'
import { loadProject } from '../src/project'
import {
  MANIFEST_ROUTE,
  PLUGINS_ROUTE,
  PREVIEW_ENTRY_ID,
  previewEntry,
  servePlugin,
} from '../src/serve'

// Ce que `crypte dev` sert vraiment, mesuré sur un serveur qui écoute.

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

  // Le projet a sa propre `index.html`, comme tout vrai projet. Sans
  // `appType: 'custom'`, le repli de Vite la sert pour toute URL inconnue, donc
  // une faute de frappe rendrait la page de l'application au lieu d'un 404.
  it('never serves the project page in place of an unknown route', async () => {
    const { status, body } = await get('/pas-une-route')

    expect(status).toBe(404)
    expect(body).not.toContain('la page du projet')
  })

  it('serves the catalogue from memory, not from the written file', async () => {
    const { status, body } = await get(MANIFEST_ROUTE)

    expect(status).toBe(200)
    expect(JSON.parse(body)).toEqual(started.held.catalogue.manifest)
  })

  // Les modules shell des plugins, section 6.1 : listés dans l'ordre de la
  // configuration, servis depuis leur dossier et jamais au-delà. Les plugins
  // sont injectés dans le projet que le serveur tient, lu à chaque requête.
  describe('the plugin routes', () => {
    let dossier: string

    beforeAll(() => {
      dossier = mkdtempSync(join(tmpdir(), 'crypte-plugin-'))
      mkdirSync(join(dossier, 'dist'))
      writeFileSync(join(dossier, 'dist', 'shell.mjs'), "import './chunk.mjs'\n")
      writeFileSync(join(dossier, 'dist', 'chunk.mjs'), 'export {}\n')
      writeFileSync(join(dossier, 'secret.txt'), 'hors du dossier\n')

      started.project.config.plugins = [
        { name: 'a', shell: pathToFileURL(join(dossier, 'dist', 'shell.mjs')).href },
      ]
    })

    afterAll(() => {
      delete started.project.config.plugins
      rmSync(dossier, { recursive: true, force: true })
    })

    it('lists each shell module under its own URL', async () => {
      const { status, body } = await get(PLUGINS_ROUTE)

      expect(status).toBe(200)
      expect(JSON.parse(body)).toEqual([{ name: 'a', shell: '/@crypte/plugins/0/shell.mjs' }])
    })

    it('serves the module and the chunks beside it', async () => {
      const module = await fetch(`${origin}/@crypte/plugins/0/shell.mjs`)
      const chunk = await get('/@crypte/plugins/0/chunk.mjs')

      expect(module.status).toBe(200)
      expect(module.headers.get('content-type')).toMatch(/^text\/javascript/)
      expect(await module.text()).toBe("import './chunk.mjs'\n")
      expect(chunk).toEqual({ status: 200, body: 'export {}\n' })
    })

    it.for([
      ['an index no plugin holds', '/@crypte/plugins/1/shell.mjs'],
      ['a property of the list', '/@crypte/plugins/length/shell.mjs'],
      ['a file the folder does not hold', '/@crypte/plugins/0/absent.mjs'],
    ])('answers 404 to %s', async ([, path]) => {
      expect(await get(path!)).toEqual({ status: 404, body: '' })
    })

    // Par une requête brute : `fetch` normalise `..` avant d'envoyer, et le cas
    // n'éprouvait alors que le routage.
    it('never serves a file above the folder', async () => {
      const answer = await new Promise<string>((resolve, reject) => {
        const port = new URL(origin).port
        request({ port, path: '/@crypte/plugins/0/../secret.txt' }, (response) => {
          let body = ''
          response.on('data', (chunk: Buffer) => (body += chunk))
          response.on('end', () => resolve(`${response.statusCode} ${body}`))
        })
          .on('error', reject)
          .end()
      })

      expect(answer).toBe('404 ')
    })
  })

  // La compilation elle-même, que le cas ci-dessus ne tient pas : la fixture
  // écrit une configuration sans TypeScript, donc contourner `compiled` n'y
  // change rien. L'entrée recopie l'expression de la configuration, donc un
  // `as` arriverait au navigateur et la preview mourrait sur un `SyntaxError`.
  // `DCJ-224`.
  it('strips the TypeScript the config wrote', async () => {
    const root = mkdtempSync(join(tmpdir(), 'crypte-typed-'))
    const project = { root, config: { stories: 'stories' } } as never

    try {
      writeFileSync(
        join(root, 'crypte.config.ts'),
        "export default { stories: 'stories', adapter: { name: 'x' } as { name: string } }\n",
      )

      const load = servePlugin(project, () => ({ manifest: { entries: [] } }) as never).load
      const served = await (load as (this: unknown, id: string) => Promise<{ code: string }>).call(
        { warn: () => {} },
        PREVIEW_ENTRY_ID,
      )

      // Les deux sens : la source la porte, le servi ne la porte plus.
      expect(previewEntry(project)).toContain('as { name: string }')
      expect(served.code).not.toContain('as { name: string }')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// Le chemin absolu du dépôt, remplacé par un repère : sinon l'instantané ne vaut
// que sur la machine qui l'a écrit.
const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const sansRacine = (source: string) => source.replaceAll(racine, '<racine>')

describe('the preview entry', () => {
  // L'entrée entière, dans un fichier que la revue lit comme un diff.
  //
  // Elle remplace six assertions par sous-chaîne sur cette même source. Une
  // sous-chaîne passe dès que le texte la contient, pour n'importe quelle
  // raison ; un instantané compare tout, donc il ne peut pas passer pour la
  // mauvaise raison. Il se met à jour par `vp test -u`, et sa mise à jour se
  // relit.
  it('returns an entry the review reads in full', async () => {
    const source = previewEntry(await loadProject(fixture), ['stories/Gardee.tsx'])

    // La racine du dépôt est remplacée : l'entrée porte le chemin absolu de la
    // feuille de style, donc l'instantané ne vaudrait que sur cette machine.
    await expect(sansRacine(source)).toMatchFileSnapshot('./snapshots/preview-entry.js')
  })

  // Un nom de fichier est une donnée, pas du code : interpolé brut, une
  // apostrophe ferme la chaîne et le reste du nom devient du JavaScript.
  it('escapes the file name in the import', () => {
    const source = previewEntry({ root: fixture, config: { stories: 'stories' } } as never, [
      String.raw`stories/L'"Ecart.tsx`,
    ])

    expect(source).toContain(String.raw`import("/stories/L'\"Ecart.tsx")`)
  })

  // Une promesse par module, comme les stories : importé statiquement, un
  // module qui lève emportait l'entrée entière. Le nom du plugin est une
  // donnée, échappée comme un nom de fichier.
  it('imports each plugin preview module on its own', () => {
    const file = join(fixture, 'entry.jsx')
    const project = {
      root: fixture,
      config: {
        stories: 'stories',
        plugins: [{ name: `l'"ecart`, preview: pathToFileURL(file).href }],
      },
    } as never

    const lines = previewEntry(project, []).split('\n')
    const start = lines.findIndex((one) => one.includes(file))

    expect(sansRacine(lines.slice(start - 1, start + 2).join('\n'))).toMatchInlineSnapshot(`
      "await Promise.all([
        import("<racine>/packages/cli/test/fixture/entry.jsx").catch((error) => console.error("crypte: the preview module of l'\\"ecart could not load", error)),
      ])"
    `)
  })
})

// La commande elle-même, et non le serveur qu'elle monte : ces lignes-ci sont
// tout ce que l'utilisateur voit au démarrage, et la couverture les donnait
// jamais exécutées.
describe('what the command says on startup', () => {
  const commande = base.extend<{ projet: { root: string; dit: () => Promise<string[]> } }>({
    // Le paramètre vide est la forme que vitest lit pour savoir quelles fixtures
    // initialiser. Le renommer fait collecter zéro test : mesuré.
    projet: async ({}, use) => {
      const root = mkdtempSync(join(fixture, '..', 'tmp-dev-'))
      cpSync(fixture, root, { recursive: true })

      let running: Running | undefined

      await use({
        root,
        dit: async () => {
          const lignes: string[] = []
          running = await dev(root, (line: string) => lignes.push(line))

          return lignes
        },
      })

      await running?.close()
      rmSync(root, { recursive: true, force: true })
    },
  })

  commande('counts the served stories', async ({ projet }) => {
    expect(await projet.dit()).toContain('4 stories')
  })

  // Un fichier que le lecteur n'a pas su lire est nommé, avec sa raison : c'est
  // le silence que le lot 4 a fermé, et il vaut aussi au démarrage.
  commande('names the story files left out', async ({ projet }) => {
    writeFileSync(join(projet.root, 'stories', 'Muette.js'), 'export default 12')

    const lignes = await projet.dit()

    expect(lignes.some((une) => une.includes('story file(s) left out'))).toBe(true)
    expect(lignes.some((une) => une.includes('Muette.js'))).toBe(true)
  })

  // Le manifeste et l'empreinte s'écrivent sous `.crypte`. Un fichier à cette
  // place fait échouer l'écriture, et l'utilisateur doit l'apprendre plutôt que
  // de chercher un manifeste qui n'arrivera jamais.
  commande('says when neither manifest nor fingerprint could be written', async ({ projet }) => {
    rmSync(join(projet.root, '.crypte'), { recursive: true, force: true })
    writeFileSync(join(projet.root, '.crypte'), 'pas un dossier')

    const lignes = await projet.dit()

    expect(
      lignes.some((une) => une.includes('neither manifest nor fingerprint could be written')),
    ).toBe(true)
  })
})
