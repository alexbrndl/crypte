import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type InlineConfig } from 'vite'
import { describe, expect, it } from 'vitest'
import { aliasesOf } from '../src/aliases'
import { ConfigError, cssEntryOf, loadProject, viteConfigOf } from '../src/project'

// La fixture reproduit les contraintes d'un projet réel : alias `@/`, pas de
// `tsconfig.json` mais un `jsconfig.json` à commentaires, des fichiers `.jsx`,
// et un import d'asset. Voir architecture.md.

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixture')

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
  const root = mkdtempSync(join(tmpdir(), 'crypte-config-'))
  writeFileSync(join(root, 'crypte.config.ts'), source)
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

describe('alias du projet', () => {
  it('lit les chemins d’un jsconfig.json commenté', async () => {
    const alias = await aliasesOf(fixture)

    expect(alias).toEqual([{ find: '@', replacement: join(fixture, 'src') }])
  })

  // Sans configuration, pas d'alias : le CLI n'en invente aucun.
  it('ne rend rien quand le projet n’en déclare pas', async () => {
    expect(await aliasesOf(join(fixture, 'src'))).toEqual([])
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
