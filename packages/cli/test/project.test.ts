import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type InlineConfig } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import { projectPathsOf } from '../src/config-paths'
import { capture, pathsPlugin } from '../src/paths'
import { ConfigError, cssEntryOf, loadProject, viteConfigOf } from '../src/project'

// La fixture reproduit les contraintes d'un projet réel : alias `@/`, pas de
// `tsconfig.json` mais un `jsconfig.json` à commentaires, des fichiers `.jsx`,
// et un import d'asset. Voir architecture.md.

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixture')

// Les projets jetables créés par les cas ci-dessous, effacés à la fin : sans
// cela, chaque lancement en laisse une poignée dans le dossier temporaire.
const temporary: string[] = []

afterAll(() => {
  for (const root of temporary) rmSync(root, { recursive: true, force: true })
})

// Chaque serveur a son propre dossier de cache, et n'optimise aucune dépendance.
// Sans cela ils partagent `node_modules/.vite` sous la fixture, ce qui a produit
// deux échecs isolés en vingt-cinq lancements, jamais reproduits depuis. La cause
// n'est donc pas démontrée : ce qui l'est, c'est que le dossier était commun.
async function serverOn(config: InlineConfig) {
  const cacheDir = mkdtempSync(join(tmpdir(), 'crypte-vite-'))
  const server = await createServer({
    ...config,
    cacheDir,
    optimizeDeps: { noDiscovery: true, include: [] },
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  return {
    server,
    async close() {
      await server.close()
      rmSync(cacheDir, { recursive: true, force: true })
    },
  }
}

// Un projet jetable, pour éprouver ce que le CLI accepte et refuse.
function projectWith(source: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-config-')))
  writeFileSync(join(root, 'crypte.config.ts'), source)
  temporary.push(root)
  return root
}

describe('chargement de la configuration', () => {
  it('lit un crypte.config.ts et suit ses dépendances', async () => {
    const project = await loadProject(fixture)

    expect(project.config.stories).toBe('stories')
    expect(project.config.adapter).toEqual({ name: 'fixture' })
    expect(project.watch.some((file) => file.endsWith('crypte.config.ts'))).toBe(true)
  })

  it('rend l’entrée CSS en chemin absolu', async () => {
    const css = cssEntryOf(await loadProject(fixture))
    expect(css).toBe(join(fixture, 'src/styles/app.css'))
  })

  // Une racine relative, ce qu'un `crypte dev ./demo` passerait depuis la ligne
  // de commande : sans normalisation, tous les chemins produits le restent.
  it('normalise une racine relative', async () => {
    const project = await loadProject(relative(process.cwd(), fixture))

    expect(isAbsolute(project.root)).toBe(true)
    expect(isAbsolute(cssEntryOf(project) as string)).toBe(true)
  })

  // Le message nomme le fichier attendu et l'endroit cherché : sans cela,
  // l'utilisateur ne sait pas si le fichier manque ou s'il est mal placé.
  it('nomme le fichier manquant plutôt que de lever une trace de pile', async () => {
    await expect(loadProject(join(fixture, 'src'))).rejects.toThrow(ConfigError)
    await expect(loadProject(join(fixture, 'src'))).rejects.toThrow(/crypte\.config\.ts/)
  })

  // Deux champs obligatoires, et rien d'autre : c'est le minimum de
  // configuration que la section 1.5 promet.
  it('accepte une configuration réduite aux deux champs obligatoires', async () => {
    const root = projectWith('export default { stories: "s", adapter: {} }')
    const project = await loadProject(root)

    expect(project.config.stories).toBe('s')
    expect(project.config.css).toBeUndefined()
  })

  // Sans ces cas, retirer toute la validation laisse la suite verte. Mesuré.
  // Vite lève sur un module sans export par défaut, avec un message qui parle
  // de configuration Vite. Le rattraper est la seule façon de nommer le fichier.
  it('nomme le fichier quand il n’exporte rien', async () => {
    const root = projectWith('export const config = { stories: "s" }')

    await expect(loadProject(root)).rejects.toThrow(ConfigError)
    await expect(loadProject(root)).rejects.toThrow(/crypte\.config\.ts/)
  })

  it.each([
    ['sans stories', 'export default { adapter: {} }', /stories/],
    ['avec un stories vide', 'export default { stories: "", adapter: {} }', /stories/],
    ['sans adapter', 'export default { stories: "s" }', /adapter/],
  ])('refuse une configuration %s, en nommant le champ', async (_, source, expected) => {
    const root = projectWith(source)

    await expect(loadProject(root)).rejects.toThrow(ConfigError)
    await expect(loadProject(root)).rejects.toThrow(expected)
  })
})

// Un projet jetable, décrit par ses fichiers, pour éprouver les formes de
// configuration qu'on rencontre sans les faire vivre dans la fixture.
// `realpathSync` parce que les chemins rendus le sont : sur macOS, `tmpdir()`
// passe par un lien symbolique, et les deux écritures du même dossier diffèrent.
function projectOf(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-alias-')))
  for (const [name, content] of Object.entries(files)) {
    const file = join(root, name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
  temporary.push(root)
  return root
}

describe('chemins déclarés par le projet', () => {
  const pathsOf = async (root: string) => (await projectPathsOf(root))?.paths

  it('lit les chemins d’un jsconfig.json commenté', async () => {
    expect(await pathsOf(fixture)).toEqual({ '@/*': ['src/*'] })
  })

  // Sans configuration, rien : le CLI n'invente aucun chemin.
  it('ne rend rien quand le projet n’en déclare pas', async () => {
    expect(await projectPathsOf(join(fixture, 'src'))).toBeUndefined()
  })

  // La forme que produit `npm create vite` : la racine ne porte que des
  // références, et les chemins vivent dans le fichier référencé.
  it('suit les références d’un tsconfig de style solution', async () => {
    const root = projectOf({
      'tsconfig.json': '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }',
      'tsconfig.app.json':
        '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }',
    })

    expect(await pathsOf(root)).toEqual({ '@/*': ['src/*'] })
  })

  // Un `tsconfig.json` sans chemins ne doit pas masquer le `jsconfig.json` qui
  // en porte : sinon le support JavaScript tombe dès qu'un des deux traîne.
  it.each([
    ['sans clé paths', '{ "compilerOptions": { "strict": true } }'],
    ['avec un paths vide', '{ "compilerOptions": { "paths": {} } }'],
  ])('continue jusqu’au fichier qui déclare des chemins, %s', async (_, tsconfig) => {
    const root = projectOf({
      'tsconfig.json': tsconfig,
      'jsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
    })

    expect(await pathsOf(root)).toEqual({ '@/*': ['src/*'] })
  })

  // `tsconfck` rend `baseUrl` absolu mais pas les chemins : hérités d'un autre
  // dossier, ils se comptent depuis le fichier qui les déclare.
  it('compte les chemins hérités depuis le fichier qui les déclare', async () => {
    const root = projectOf({
      'base.json': '{ "compilerOptions": { "paths": { "@shared/*": ["shared/src/*"] } } }',
      'app/tsconfig.json': '{ "extends": "../base.json" }',
    })

    expect((await projectPathsOf(join(root, 'app')))?.base).toBe(root)
  })

  // Et l'inverse, la forme courante : le projet étend un fichier lointain,
  // `@tsconfig/node22` par exemple, et déclare ses propres chemins.
  it('compte les chemins déclarés localement depuis le projet', async () => {
    const root = projectOf({
      'base.json': '{ "compilerOptions": { "strict": true } }',
      'app/tsconfig.json':
        '{ "extends": "../base.json", "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
    })

    expect((await projectPathsOf(join(root, 'app')))?.base).toBe(join(root, 'app'))
  })

  it('nomme le fichier quand il est illisible', async () => {
    const root = projectOf({ 'tsconfig.json': '{ "compilerOptions": { paths } }' })

    await expect(projectPathsOf(root)).rejects.toThrow(ConfigError)
    await expect(projectPathsOf(root)).rejects.toThrow(/tsconfig\.json/)
  })
})

// La correspondance d'un motif, éprouvée seule : de l'extérieur, une capture
// fautive est invisible, puisque le repli renvoie l'import à Vite comme si rien
// ne s'était passé.
describe('correspondance d’un motif', () => {
  it.each([
    ['#app', '#app', ''],
    ['@/*', '@/a.js', 'a.js'],
    ['@*', '@a.js', 'a.js'],
    ['*', 'a.js', 'a.js'],
    ['*.css', 'a.css', 'a'],
    ['a/*/z', 'a/b/z', 'b'],
  ])('capture %s sur %s', (pattern, id, attendu) => {
    expect(capture(pattern, id)).toBe(attendu)
  })

  it.each([
    ['un motif exact contre un autre identifiant', '#app', '@scope/pkg'],
    ['un préfixe qui ne correspond pas', '@/*', '@scope/pkg'],
    ['un suffixe qui ne correspond pas', '*.css', 'a.js'],
    ['un identifiant trop court pour le motif', 'a*a', 'a'],
    ['un joker au milieu sans la fin attendue', 'a/*/z', 'a/b/y'],
  ])('ne capture pas %s', (_, pattern, id) => {
    expect(capture(pattern, id)).toBeNull()
  })
})

// L'espace des motifs est fini : TypeScript en admet au plus un joker. Ces cas
// le parcourent en entier, par une résolution réelle et non par la forme d'un
// alias, qui peut être juste et pourtant inerte.
describe('résolution des chemins', () => {
  async function resolving(paths: string, files: Record<string, string>) {
    const root = projectOf({
      'tsconfig.json': `{ "compilerOptions": { "paths": ${paths} } }`,
      'node_modules/@scope/pkg/package.json': '{ "name": "@scope/pkg", "main": "i.js" }',
      'node_modules/@scope/pkg/i.js': 'export const p = 1',
      ...files,
    })
    const declared = await projectPathsOf(root)
    const { server, close } = await serverOn({
      root,
      configFile: false,
      plugins: declared ? [pathsPlugin(declared)] : [],
    })

    return { root, server, close }
  }

  it.each([
    ['exact', '{ "#app": ["src/app.js"] }', 'import "#app"', 'src/app.js'],
    ['préfixe séparé', '{ "@/*": ["src/*"] }', 'import "@/app.js"', 'src/app.js'],
    ['préfixe collé', '{ "@*": ["src/*"] }', 'import "@app.js"', 'src/app.js'],
    ['préfixe nommé', '{ "lib-*": ["src/*"] }', 'import "lib-app.js"', 'src/app.js'],
    ['fourre-tout', '{ "*": ["src/*"] }', 'import "app.js"', 'src/app.js'],
    ['suffixe', '{ "*.css": ["styles/*.css"] }', 'import "app.css"', 'styles/app.css'],
    ['joker au milieu', '{ "a/*/z": ["src/*/z.js"] }', 'import "a/app/z"', 'src/app/z.js'],
    ['sans extension', '{ "@/*": ["src/*"] }', 'import "@/app"', 'src/app.js'],
    ['vers un index', '{ "@/*": ["src/*"] }', 'import "@/mod"', 'src/mod/index.js'],
    ['seconde cible', '{ "@/*": ["absent/*", "src/*"] }', 'import "@/app.js"', 'src/app.js'],
  ])('résout le motif %s', async (_, paths, source, cible) => {
    const { server, close } = await resolving(paths, {
      'entry.js': source,
      [cible]: 'export const x = 1',
    })

    try {
      await expect(server.transformRequest('/entry.js')).resolves.not.toBeNull()
    } finally {
      await close()
    }
  })

  // Le repli, qui est toute la raison d'être du résolveur : un alias réécrirait
  // sans condition et détournerait ce paquet vers `src/scope/pkg`. Le code doit
  // pointer vers `node_modules`, non se contenter d'être transformé : rendre
  // l'identifiant tel quel passerait aussi, sans avoir rien résolu.
  it('laisse Vite résoudre un paquet qu’aucune cible ne couvre', async () => {
    const { server, close } = await resolving('{ "@*": ["src/*"] }', {
      'entry.js': 'import "@scope/pkg"',
    })

    try {
      const result = await server.transformRequest('/entry.js')
      expect(result?.code).toContain('node_modules/@scope/pkg')
    } finally {
      await close()
    }
  })

  // Un motif ne correspond que s'il correspond vraiment : sans la comparaison
  // du suffixe ou l'égalité stricte d'un motif exact, tout serait capturé, et
  // la première cible venue détournerait des imports sans rapport.
  it.each([
    ['un suffixe qui ne correspond pas', '{ "*.css": ["styles/*.css"] }', 'import "@scope/pkg"'],
    ['un motif exact qui ne correspond pas', '{ "#app": ["src/app.js"] }', 'import "@scope/pkg"'],
    ['un préfixe qui ne correspond pas', '{ "@/*": ["src/*"] }', 'import "@scope/pkg"'],
  ])('ne capture pas %s', async (_, paths, source) => {
    const { server, close } = await resolving(paths, { 'entry.js': source })

    try {
      const result = await server.transformRequest('/entry.js')
      expect(result?.code).toContain('node_modules/@scope/pkg')
    } finally {
      await close()
    }
  })

  it.each([
    [
      'le motif le plus spécifique',
      '{ "@/*": ["src/*"], "@/lib/*": ["vendor/*"] }',
      'export { x } from "@/lib/a.js"',
      '/vendor/',
    ],
    [
      'le motif exact avant le joker',
      '{ "#app/*": ["vendor/*"], "#app": ["src/lib/a.js"] }',
      'export { x } from "#app"',
      '/src/',
    ],
    [
      'la cible qui existe',
      '{ "@/lib/*": ["absent/*"], "@/*": ["src/*"] }',
      'export { x } from "@/lib/a.js"',
      '/src/',
    ],
  ])('retient %s', async (_, paths, source, attendu) => {
    const { server, close } = await resolving(paths, {
      'entry.js': source,
      'src/lib/a.js': 'export const x = 1',
      'vendor/a.js': 'export const x = 1',
    })

    try {
      const result = await server.transformRequest('/entry.js')
      expect(result?.code).toContain(attendu)
    } finally {
      await close()
    }
  })
})

// Le lot existe pour lever ce risque : que la résolution échoue sur un projet
// réel se découvrirait autrement au moment de servir la preview.
describe('résolution réelle par un serveur Vite', () => {
  it('résout un alias et un asset depuis un fichier .jsx', async () => {
    const project = await loadProject(fixture)
    const { server, close } = await serverOn(await viteConfigOf(project))

    try {
      const result = await server.transformRequest('/entry.jsx')

      expect(result, 'entry.jsx n’a pas été transformé').not.toBeNull()
      expect(result?.code).toContain('/src/components/Badge.jsx')
      expect(result?.code).toContain('/src/assets.js')
    } finally {
      await close()
    }
  })

  // Contrôle négatif : sans le résolveur, le même import échoue. Sinon le cas
  // ci-dessus passerait aussi bien avec une configuration vide.
  it('échoue sans le résolveur, ce qui prouve qu’il sert', async () => {
    const { server, close } = await serverOn({ root: fixture, configFile: false })

    try {
      await expect(server.transformRequest('/entry.jsx')).rejects.toThrow(/@\/components\/Badge/)
    } finally {
      await close()
    }
  })
})
