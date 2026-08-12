import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type InlineConfig } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import { aliasesOf } from '../src/aliases'
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

describe('alias du projet', () => {
  it('lit les chemins d’un jsconfig.json commenté', async () => {
    const alias = await aliasesOf(fixture)

    expect(alias).toEqual([{ find: '@', replacement: join(fixture, 'src') }])
  })

  // Sans configuration, pas d'alias : le CLI n'en invente aucun.
  it('ne rend rien quand le projet n’en déclare pas', async () => {
    expect(await aliasesOf(join(fixture, 'src'))).toEqual([])
  })

  // La forme que produit `npm create vite` : la racine ne porte que des
  // références, et les chemins vivent dans le fichier référencé.
  it('suit les références d’un tsconfig de style solution', async () => {
    const root = projectOf({
      'tsconfig.json': '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }',
      'tsconfig.app.json':
        '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }',
    })

    expect(await aliasesOf(root)).toEqual([{ find: '@', replacement: join(root, 'src') }])
  })

  // Un `tsconfig.json` sans chemins ne doit pas masquer le `jsconfig.json` qui
  // en porte : sinon le support JavaScript tombe dès qu'un des deux traîne.
  it('continue jusqu’au fichier qui déclare des chemins', async () => {
    const root = projectOf({
      'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
      'jsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
    })

    expect(await aliasesOf(root)).toEqual([{ find: '@', replacement: join(root, 'src') }])
  })

  // TypeScript retient le motif le plus long, Vite le premier qui correspond :
  // sans tri, `@/lib/x` part vers `src/lib/x` au lieu de `vendor/lib/x`.
  it('place le motif le plus spécifique en premier', async () => {
    const root = projectOf({
      'tsconfig.json':
        '{ "compilerOptions": { "paths": { "@/*": ["src/*"], "@/lib/*": ["vendor/lib/*"] } } }',
    })

    const alias = await aliasesOf(root)
    expect(alias.map((entry) => entry.find)).toEqual(['@/lib', '@'])
  })

  // `tsconfck` rend `baseUrl` absolu mais pas les chemins : hérités d'un autre
  // dossier, ils se comptent depuis le fichier qui les déclare.
  it('compte les chemins hérités depuis le fichier qui les déclare', async () => {
    const root = projectOf({
      'base.json': '{ "compilerOptions": { "paths": { "@shared/*": ["shared/src/*"] } } }',
      'app/tsconfig.json': '{ "extends": "../base.json" }',
    })

    expect(await aliasesOf(join(root, 'app'))).toEqual([
      { find: '@shared', replacement: join(root, 'shared/src') },
    ])
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

  // Contrôle négatif : sans les alias, le même import échoue. Sinon le cas
  // ci-dessus passerait aussi bien avec une configuration vide.
  it('échoue sans les alias, ce qui prouve qu’ils servent', async () => {
    const { server, close } = await serverOn({ root: fixture, configFile: false })

    try {
      await expect(server.transformRequest('/entry.jsx')).rejects.toThrow(/@\/components\/Badge/)
    } finally {
      await close()
    }
  })
})
