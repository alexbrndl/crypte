import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type InlineConfig, type ViteDevServer } from 'vite'
import { describe, expect, test as base } from 'vitest'
import { projectPathsOf } from '../src/config-paths'
import { capture, isBareSpecifier } from '../src/paths'
import { defineConfig } from '../src/config'
import { ConfigError, cssEntryOf, loadProject, viteConfigOf } from '../src/project'

// La fixture reproduit les contraintes d'un projet réel : alias `@/`, pas de
// `tsconfig.json` mais un `jsconfig.json` à commentaires, des fichiers `.jsx`,
// et un import d'asset.

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixture')

type ProjectWith = (source: string) => string
type ProjectOf = (files: Record<string, string>) => string
type ServerOn = (config: InlineConfig) => Promise<ViteDevServer>
type Resolving = (
  paths: string,
  files: Record<string, string>,
) => Promise<{ root: string; server: ViteDevServer }>

// Tout ce que ces cas créent est démonté par vitest, y compris quand le cas
// lève : à la main, chaque serveur demandait son `try`/`finally`, et les projets
// jetables s'accumulaient dans le dossier temporaire.
const test = base.extend<{
  projectWith: ProjectWith
  projectOf: ProjectOf
  serverOn: ServerOn
  resolving: Resolving
}>({
  // Le paramètre vide est la forme que vitest lit pour savoir quelles fixtures
  // initialiser. Le renommer fait collecter zéro test : mesuré.
  projectWith: async ({}, use) => {
    const roots: string[] = []

    await use((source) => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-config-')))
      writeFileSync(join(root, 'crypte.config.ts'), source)
      roots.push(root)
      return root
    })

    for (const root of roots) rmSync(root, { recursive: true, force: true })
  },

  // `realpathSync` parce que les chemins rendus le sont : sur macOS, `tmpdir()`
  // passe par un lien symbolique, et les deux écritures du même dossier
  // diffèrent.
  projectOf: async ({}, use) => {
    const roots: string[] = []

    await use((files) => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-alias-')))

      for (const [name, content] of Object.entries(files)) {
        const file = join(root, name)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, content)
      }

      roots.push(root)
      return root
    })

    for (const root of roots) rmSync(root, { recursive: true, force: true })
  },

  // Chaque serveur a son propre dossier de cache, et n'optimise aucune
  // dépendance. Sans cela ils partagent `node_modules/.vite` sous la fixture, ce
  // qui a produit deux échecs isolés en vingt-cinq lancements, jamais reproduits
  // depuis. La cause n'est donc pas démontrée : ce qui l'est, c'est que le
  // dossier était commun.
  serverOn: async ({}, use) => {
    const ouverts: { server: ViteDevServer; cacheDir: string }[] = []

    await use(async (config) => {
      const cacheDir = mkdtempSync(join(tmpdir(), 'crypte-vite-'))
      const server = await createServer({
        ...config,
        cacheDir,
        optimizeDeps: { noDiscovery: true, include: [] },
        logLevel: 'silent',
        server: { middlewareMode: true },
      })

      ouverts.push({ server, cacheDir })
      return server
    })

    for (const { server, cacheDir } of ouverts) {
      await server.close()
      rmSync(cacheDir, { recursive: true, force: true })
    }
  },

  // Un projet décrit par ses chemins et ses fichiers, servi par la
  // configuration réelle du CLI et non par un serveur monté à la main : une
  // option ajoutée ailleurs, un alias par exemple, doit se voir ici.
  resolving: async ({ projectOf, serverOn }, use) => {
    await use(async (paths, files) => {
      const root = projectOf({
        'tsconfig.json': `{ "compilerOptions": { "paths": ${paths} } }`,
        'crypte.config.ts': 'export default { stories: "s", adapter: {} }',
        'node_modules/@scope/pkg/package.json': '{ "name": "@scope/pkg", "main": "i.js" }',
        'node_modules/@scope/pkg/i.js': 'export const p = 1',
        ...files,
      })

      return { root, server: await serverOn(viteConfigOf(await loadProject(root))) }
    })
  },
})

// `defineConfig` existe pour les types et l'autocomplétion, et rend son argument
// tel quel : en rendre une copie ferait perdre l'identité des plugins que le
// projet y met.
describe('defineConfig', () => {
  test('returns the object it receives, without copying it', () => {
    const config = { stories: 'stories', adapter: {} }

    expect(defineConfig(config)).toBe(config)
  })
})

describe('config loading', () => {
  test('reads a crypte.config.ts and tracks its dependencies', async () => {
    const project = await loadProject(fixture)

    expect(project.config.stories).toBe('stories')
    expect(project.config.adapter).toEqual({ name: 'fixture' })
    expect(project.watch.some((file) => file.endsWith('crypte.config.ts'))).toBe(true)
  })

  // Une racine relative, ce qu'un `crypte dev ./demo` passerait depuis la ligne
  // de commande : sans normalisation, tous les chemins produits le restent.
  test('normalizes a relative root', async () => {
    const project = await loadProject(relative(process.cwd(), fixture))

    expect(isAbsolute(project.root)).toBe(true)
    expect(isAbsolute(cssEntryOf(project) as string)).toBe(true)
  })

  // Le message nomme le fichier attendu et l'endroit cherché : sans cela,
  // l'utilisateur ne sait pas si le fichier manque ou s'il est mal placé.
  test('names the missing file rather than throwing a stack trace', async () => {
    await expect(loadProject(join(fixture, 'src'))).rejects.toThrow(ConfigError)
    await expect(loadProject(join(fixture, 'src'))).rejects.toThrow(/crypte\.config\.ts/)
  })

  // Sans ces cas, retirer toute la validation laisse la suite verte. Mesuré.
  // Vite lève sur un module sans export par défaut, avec un message qui parle
  // de configuration Vite. Le rattraper est la seule façon de nommer le fichier.
  test('names the file when it exports nothing', async ({ projectWith }) => {
    const root = projectWith('export const config = { stories: "s" }')

    await expect(loadProject(root)).rejects.toThrow(ConfigError)
    await expect(loadProject(root)).rejects.toThrow(/crypte\.config\.ts/)
  })

  test.for([
    ['without stories', 'export default { adapter: {} }', /stories/],
    ['with an empty stories', 'export default { stories: "", adapter: {} }', /stories/],
    ['without adapter', 'export default { stories: "s" }', /adapter/],
    // Les facultatifs aussi : mal typés, ils lèvent plus loin sur un spread ou
    // un `resolve`, avec une erreur qui ne nomme ni le fichier ni le champ.
    [
      'with a css that is not a path',
      'export default { stories: "s", adapter: {}, css: 12 }',
      /css/,
    ],
    [
      'with plugins that are not an array',
      'export default { stories: "s", adapter: {}, plugins: {} }',
      /plugins/,
    ],
    [
      'with a malformed vite.plugins',
      'export default { stories: "s", adapter: {}, vite: { plugins: {} } }',
      /vite\.plugins/,
    ],
  ] as const)(
    'refuses a config %s, naming the field',
    async ([, source, attendu], { projectWith }) => {
      const root = projectWith(source)

      await expect(loadProject(root)).rejects.toThrow(ConfigError)
      await expect(loadProject(root)).rejects.toThrow(attendu)
    },
  )
})

describe('paths declared by the project', () => {
  const pathsOf = async (root: string) => (await projectPathsOf(root))?.paths

  // Sans configuration, rien : le CLI n'invente aucun chemin.
  test('returns nothing when the project declares none', async () => {
    expect(await projectPathsOf(join(fixture, 'src'))).toBeUndefined()
  })

  // Un `tsconfig.json` sans chemins ne doit pas masquer le `jsconfig.json` qui
  // en porte : sinon le support JavaScript tombe dès qu'un des deux traîne.
  test.for([['with an empty paths', '{ "compilerOptions": { "paths": {} } }']] as const)(
    'goes on to the file that declares paths, %s',
    async ([, tsconfig], { projectOf }) => {
      const root = projectOf({
        'tsconfig.json': tsconfig,
        'jsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
      })

      expect(await pathsOf(root)).toEqual({ '@/*': ['src/*'] })
    },
  )

  // `tsconfck` rend `baseUrl` absolu mais pas les chemins : hérités d'un autre
  // dossier, ils se comptent depuis le fichier qui les déclare.
  test('resolves inherited paths from the file that declares them', async ({ projectOf }) => {
    const root = projectOf({
      'base.json': '{ "compilerOptions": { "paths": { "@shared/*": ["shared/src/*"] } } }',
      'app/tsconfig.json': '{ "extends": "../base.json" }',
    })

    expect((await projectPathsOf(join(root, 'app')))?.base).toBe(root)
  })

  // Et l'inverse, la forme courante : le projet étend un fichier lointain,
  // `@tsconfig/node22` par exemple, et déclare ses propres chemins.
  test('resolves locally declared paths from the project', async ({ projectOf }) => {
    const root = projectOf({
      'base.json': '{ "compilerOptions": { "strict": true } }',
      'app/tsconfig.json':
        '{ "extends": "../base.json", "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
    })

    expect((await projectPathsOf(join(root, 'app')))?.base).toBe(join(root, 'app'))
  })

  // Une chaîne au lieu d'un tableau : sans contrôle, la boucle parcourt les
  // caractères et cherche un fichier par lettre, sans un mot.
  // Sans ces contrôles, une cible mal typée lève un `TypeError` remonté comme
  // panne interne, au lieu du message que l'erreur de configuration mérite.
  test.for([
    ['a string instead of an array', '{ "@/*": "src/*" }'],
    ['a number among the targets', '{ "@/*": [123] }'],
  ] as const)('refuses %s', async ([, paths], { projectOf }) => {
    const root = projectOf({ 'tsconfig.json': `{ "compilerOptions": { "paths": ${paths} } }` })

    await expect(projectPathsOf(root)).rejects.toThrow(ConfigError)
    await expect(projectPathsOf(root)).rejects.toThrow(/@\/\*/)
  })

  // La racine désigne le projet référencé : la modifier change les chemins.
  test('watches the root as well as the referenced file', async ({ projectOf }) => {
    const root = projectOf({
      'tsconfig.json': '{ "files": [], "references": [{ "path": "./app.json" }] }',
      'app.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
    })

    const files = (await projectPathsOf(root))?.files ?? []
    expect(files.some((file) => file.endsWith('tsconfig.json'))).toBe(true)
    expect(files.some((file) => file.endsWith('app.json'))).toBe(true)
  })

  // Sans ce mot, l'utilisateur voit tous ses imports échouer et rien ne désigne
  // la cause, qui est dans un fichier qu'il n'a pas encore généré.
  test('warns when a missing extends loses the paths', async ({ projectOf }) => {
    const root = projectOf({ 'tsconfig.json': '{ "extends": "./.nuxt/tsconfig.json" }' })
    const dits: string[] = []

    expect(await projectPathsOf(root, (message) => dits.push(message))).toBeUndefined()
    expect(dits.join(' ')).toMatch(/tsconfig\.json.*ignor/)
  })

  // Et se tait quand le fichier suivant les fournit : annoncer une perte qui
  // n'a pas lieu vaut à peine mieux que le silence.
  test('says nothing when the next file provides the paths', async ({ projectOf }) => {
    const root = projectOf({
      'tsconfig.json': '{ "extends": "./absent.json" }',
      'jsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
    })
    const dits: string[] = []

    await projectPathsOf(root, (message) => dits.push(message))
    expect(dits).toEqual([])
  })

  // Un fichier sans chemins reste à surveiller : en ajouter doit provoquer une
  // relecture, ce qu'aucune liste ne permettra s'il n'y figure pas.
  // Le croisement que le cas suivant ne couvre pas : le fichier lu en premier
  // n'a pas de chemins, un autre en fournit, et le premier reste à surveiller
  // puisqu'il est consulté avant.
  test.for([
    [
      'when another file provides the paths',
      {
        'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
        'jsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
      },
    ],
    ['when its extends is missing', { 'tsconfig.json': '{ "extends": "./.nuxt/tsconfig.json" }' }],
  ] as const)('watches the tsconfig %s', async ([, fichiers], { projectOf }) => {
    const root = projectOf({
      ...fichiers,
      'crypte.config.ts': 'export default { stories: "s", adapter: {} }',
    })
    const project = await loadProject(root)

    expect(project.watch.some((file) => file.endsWith('tsconfig.json'))).toBe(true)
  })

  test('names the file when it is unreadable', async ({ projectOf }) => {
    const root = projectOf({ 'tsconfig.json': '{ "compilerOptions": { paths } }' })

    await expect(projectPathsOf(root)).rejects.toThrow(ConfigError)
    await expect(projectPathsOf(root)).rejects.toThrow(/tsconfig\.json/)
  })
})

// Ce que TypeScript ne fait jamais, et que ce résolveur ne doit pas faire non
// plus : appliquer les chemins à un import relatif. Comme il passe après les
// résolveurs de Vite, seuls les imports relatifs **cassés** lui parviennent, et
// les détourner ferait charger un autre module au lieu d'échouer.
describe('relative imports', () => {
  // Le croisement des deux axes : le motif le plus large possible, contre les
  // natures d'identifiant qu'il ne doit pas toucher.
  test.for([['a catch-all', '{ "*": ["src/*"] }']] as const)(
    'does not redirect a broken relative import, despite %s',
    async ([, paths], { projectOf, serverOn }) => {
      const root = projectOf({
        'tsconfig.json': `{ "compilerOptions": { "paths": ${paths} } }`,
        'crypte.config.ts': 'export default { stories: "s", adapter: {} }',
        'pages/entry.js': 'import "./manquant.css"',
        'src/manquant.css': '.a { color: red }',
      })
      const server = await serverOn(viteConfigOf(await loadProject(root)))

      await expect(server.transformRequest('/pages/entry.js')).rejects.toThrow()
    },
  )
})

// Le second axe du résolveur, aussi fini que celui des motifs : ce qu'un import
// peut être. Les chemins ne s'appliquent qu'aux noms de module, comme chez
// TypeScript ; tout le reste appartient à Vite, à un plugin, ou au disque.
//
// L'avoir oublié a produit le seul bloquant du lot : avec un motif fourre-tout,
// un `./theme.css` supprimé était détourné vers `styles/theme.css`.
// Le troisième axe : d'où vient l'import. Les chemins du projet ne valent que
// pour ses fichiers, et une dépendance qui importe un paquet absent se verrait
// sinon servir du code de l'application.
describe('import origin', () => {
  test('does not apply the paths to an installed file', async ({ projectOf, serverOn }) => {
    const root = projectOf({
      'tsconfig.json': '{ "compilerOptions": { "paths": { "*": ["src/*"] } } }',
      'crypte.config.ts': 'export default { stories: "s", adapter: {} }',
      'src/secret-lib.js': 'export const secret = 1',
      'node_modules/dep/package.json': '{ "name": "dep", "main": "i.js" }',
      'node_modules/dep/i.js': 'import "secret-lib"\nexport const d = 1',
    })
    const server = await serverOn(viteConfigOf(await loadProject(root)))

    await expect(server.transformRequest('/node_modules/dep/i.js')).rejects.toThrow()
  })
})

// Les quatre provenances possibles, complétant celle du fichier installé.
// L'ordre entre le résolveur et les plugins que le projet déclare. Le repli
// rend ce choix peu risqué, mais il reste un choix, et rien ne le gardait.
describe('resolver order', () => {
  // Le plugin est déclaré là où un projet le déclare, dans `vite.plugins` de sa
  // configuration : l'ajouter à la main court-circuiterait l'ordre qu'on teste.
  const projetAvecPlugin = (projectOf: ProjectOf, enforce: string) =>
    projectOf({
      'tsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
      'crypte.config.ts': `export default {
        stories: 's',
        adapter: {},
        vite: {
          plugins: [{
            name: 'projet',
            ${enforce}
            resolveId: (s) => (s === '@/cible.js' ? new URL('./autre/cible.js', import.meta.url).pathname : null),
          }],
        },
      }`,
      'src/cible.js': 'export const c = 1',
      'autre/cible.js': 'export const c = 2',
    })

  test('applies the paths before the project plugins', async ({ projectOf, serverOn }) => {
    const root = projetAvecPlugin(projectOf, '')
    const server = await serverOn(viteConfigOf(await loadProject(root)))

    const resolved = await server.pluginContainer.resolveId('@/cible.js')
    expect(resolved?.id).toContain('src/cible.js')
  })

  // Et ce qu'un plugin fait quand il veut la main avant lui.
  test('yields to a plugin that declares enforce pre', async ({ projectOf, serverOn }) => {
    const root = projetAvecPlugin(projectOf, "enforce: 'pre',")
    const server = await serverOn(viteConfigOf(await loadProject(root)))

    const resolved = await server.pluginContainer.resolveId('@/cible.js')
    expect(resolved?.id).toContain('autre/cible.js')
  })
})

describe('specifier kinds', () => {
  test.for([
    ['an absolute path', '/racine.js'],
    ['a plugin virtual module', 'virtual:mon-module'],
    ['a Rollup virtual id', '\0virtuel'],
    ['an empty id', ''],
  ] as const)('lets %s through', ([, id]) => {
    expect(isBareSpecifier(id)).toBe(false)
  })
})

describe('pattern matching', () => {
  test.for([['*.css', 'a.css', 'a']] as const)('captures %s on %s', ([pattern, id, attendu]) => {
    expect(capture(pattern, id)).toBe(attendu)
  })

  test.for([
    ['a prefix that does not match', '@/*', '@scope/pkg'],
    ['a suffix that does not match', '*.css', 'a.js'],
    ['an id too short for the pattern', 'a*a', 'a'],
  ] as const)('does not capture %s', ([, pattern, id]) => {
    expect(capture(pattern, id)).toBeNull()
  })
})

// L'espace des motifs est fini : TypeScript en admet au plus un joker. Ces cas
// le parcourent en entier, par une résolution réelle et non par la forme d'un
// alias, qui peut être juste et pourtant inerte.
describe('path resolution', () => {
  test.for([
    ['second target', '{ "@/*": ["absent/*", "src/*"] }', 'import "@/app.js"', 'src/app.js'],
    // La partie capturée vient de l'utilisateur : en remplacement de chaîne,
    // `$&` y désignerait le motif trouvé et produirait un autre chemin.
    ['a capture containing $&', '{ "@/*": ["src/*"] }', 'import "@/a$&b.js"', 'src/a$&b.js'],
  ] as const)('resolves the pattern %s', async ([, paths, source, cible], { resolving }) => {
    const { server } = await resolving(paths, {
      'entry.js': source,
      [cible]: 'export const x = 1',
    })

    await expect(server.transformRequest('/entry.js')).resolves.not.toBeNull()
  })

  // Un motif sans aucune cible retient quand même : TypeScript n'essaie pas le
  // motif suivant non plus, il retombe sur la résolution normale.
  test('does not fall back when the chosen pattern has no target', async ({ resolving }) => {
    const { server } = await resolving('{ "@/*": [], "@*": ["src/*"] }', {
      'entry.js': 'import "@/a.js"',
      'src/a.js': 'export const x = 1',
    })

    await expect(server.transformRequest('/entry.js')).rejects.toThrow()
  })

  // Le repli, qui est toute la raison d'être du résolveur : un alias réécrirait
  // sans condition et détournerait ce paquet vers `src/scope/pkg`. Le code doit
  // pointer vers `node_modules`, non se contenter d'être transformé : rendre
  // l'identifiant tel quel passerait aussi, sans avoir rien résolu.
  test('lets Vite resolve a package no target covers', async ({ resolving }) => {
    const { server } = await resolving('{ "@*": ["src/*"] }', {
      'entry.js': 'import "@scope/pkg"',
    })

    const result = await server.transformRequest('/entry.js')
    expect(result?.code).toContain('node_modules/@scope/pkg')
  })

  test.for([
    [
      'the most specific pattern',
      '{ "@/*": ["src/*"], "@/lib/*": ["vendor/*"] }',
      'export { x } from "@/lib/a.js"',
      '/vendor/',
    ],

    // Le préfixe d'un motif sans joker est le motif entier. Le compter à un
    // caractère près le mettrait à égalité avec le joker voisin.
    // Préfixes strictement égaux : seul le départage explicite tranche, le tri
    // étant stable et l'ordre de déclaration mettant le joker en premier.
    [
      'the exact pattern on an equal prefix',
      '{ "#app*": ["vendor/a.js"], "#app": ["src/lib/a.js"] }',
      'export { x } from "#app"',
      '/src/',
    ],
  ] as const)('picks %s', async ([, paths, source, attendu], { resolving }) => {
    const { server } = await resolving(paths, {
      'entry.js': source,
      'src/lib/a.js': 'export const x = 1',
      'vendor/a.js': 'export const x = 1',
    })

    const result = await server.transformRequest('/entry.js')
    expect(result?.code).toContain(attendu)
  })
})

// Le lot existe pour lever ce risque : que la résolution échoue sur un projet
// réel se découvrirait autrement au moment de servir la preview.
describe('real resolution by a Vite server', () => {
  test('resolves an alias and an asset from a .jsx file', async ({ serverOn }) => {
    const project = await loadProject(fixture)
    const server = await serverOn(viteConfigOf(project))

    const result = await server.transformRequest('/entry.jsx')

    expect(result?.code).toContain('/src/components/Badge.jsx')
    expect(result?.code).toContain('/src/assets.js')
  })
})

// Deux serveurs sur la même racine, celui de crypte et le `vite dev` du projet,
// écriraient le même `_metadata.json` de dépendances optimisées.
describe('the cache directory', () => {
  test('belongs to crypte, in the project node_modules', async () => {
    const config = viteConfigOf(await loadProject(fixture))

    expect(config.cacheDir).toBe(join(fixture, 'node_modules', '.crypte'))
  })
})
