import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { describe, expect, it } from 'vitest'
import { aliasesOf } from '../src/aliases'
import { ConfigError, cssEntryOf, loadProject, viteConfigOf } from '../src/project'

// La fixture reproduit les contraintes d'un projet réel : alias `@/`, pas de
// `tsconfig.json` mais un `jsconfig.json` à commentaires, des fichiers `.jsx`,
// et un import d'asset. Voir architecture.md.

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixture')

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
    const server = await createServer({
      ...(await viteConfigOf(project)),
      logLevel: 'silent',
      server: { middlewareMode: true },
    })

    try {
      const result = await server.transformRequest('/entry.jsx')

      expect(result, 'entry.jsx n’a pas été transformé').not.toBeNull()
      expect(result?.code).toContain('/src/components/Badge.jsx')
      expect(result?.code).toContain('/src/assets.js')
    } finally {
      await server.close()
    }
  })

  // Contrôle négatif : sans les alias, le même import échoue. Sinon le cas
  // ci-dessus passerait aussi bien avec une configuration vide.
  it('échoue sans les alias, ce qui prouve qu’ils servent', async () => {
    const server = await createServer({
      root: fixture,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true },
    })

    try {
      await expect(server.transformRequest('/entry.jsx')).rejects.toThrow(/@\/components\/Badge/)
    } finally {
      await server.close()
    }
  })
})
