import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type InlineConfig } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import { projectPathsOf } from '../src/config-paths'
import { capture, isBareSpecifier, pathsPlugin } from '../src/paths'
import { ConfigError, cssEntryOf, loadProject, viteConfigOf } from '../src/project'

// La fixture reproduit les contraintes d'un projet réel : alias `@/`, pas de
// `tsconfig.json` mais un `jsconfig.json` à commentaires, des fichiers `.jsx`,
// et un import d'asset. Voir docs/internal/architecture.md.

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

  // Les chemins viennent d'un autre fichier que la configuration : le modifier
  // doit provoquer une relecture, donc il appartient à la liste.
  it('surveille aussi le fichier d’où viennent les chemins', async () => {
    const project = await loadProject(fixture)

    expect(project.watch.some((file) => file.endsWith('jsconfig.json'))).toBe(true)
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
    // Les facultatifs aussi : mal typés, ils lèvent plus loin sur un spread ou
    // un `resolve`, avec une erreur qui ne nomme ni le fichier ni le champ.
    [
      'avec un css qui n’est pas un chemin',
      'export default { stories: "s", adapter: {}, css: 12 }',
      /css/,
    ],
    [
      'avec des plugins qui ne sont pas un tableau',
      'export default { stories: "s", adapter: {}, plugins: {} }',
      /plugins/,
    ],
    [
      'avec un vite.plugins mal formé',
      'export default { stories: "s", adapter: {}, vite: { plugins: {} } }',
      /vite\.plugins/,
    ],
  ])('refuse une configuration %s, en nommant le champ', async (_, source, expected) => {
    const root = projectWith(source)

    await expect(loadProject(root)).rejects.toThrow(ConfigError)
    await expect(loadProject(root)).rejects.toThrow(expected)
  })
})

// Un projet jetable avec sa configuration minimale, pour les cas qui ont besoin
// de la configuration Vite complète plutôt que des seuls chemins.
async function loadProjectAt(root: string) {
  writeFileSync(join(root, 'crypte.config.ts'), 'export default { stories: "s", adapter: {} }')
  return loadProject(root)
}

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

  // Une chaîne au lieu d'un tableau : sans contrôle, la boucle parcourt les
  // caractères et cherche un fichier par lettre, sans un mot.
  // Sans ces contrôles, une cible mal typée lève un `TypeError` remonté comme
  // panne interne, au lieu du message que l'erreur de configuration mérite.
  it.each([
    ['une chaîne au lieu d’un tableau', '{ "@/*": "src/*" }'],
    ['un nombre parmi les cibles', '{ "@/*": [123] }'],
    ['un tableau imbriqué', '{ "@/*": [["src/*"]] }'],
  ])('refuse %s', async (_, paths) => {
    const root = projectOf({ 'tsconfig.json': `{ "compilerOptions": { "paths": ${paths} } }` })

    await expect(projectPathsOf(root)).rejects.toThrow(ConfigError)
    await expect(projectPathsOf(root)).rejects.toThrow(/@\/\*/)
  })

  // La racine désigne le projet référencé : la modifier change les chemins.
  it('surveille la racine autant que le fichier référencé', async () => {
    const root = projectOf({
      'tsconfig.json': '{ "files": [], "references": [{ "path": "./app.json" }] }',
      'app.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
    })

    const files = (await projectPathsOf(root))?.files ?? []
    expect(files.some((file) => file.endsWith('tsconfig.json'))).toBe(true)
    expect(files.some((file) => file.endsWith('app.json'))).toBe(true)
  })

  // Un `extends` introuvable arrive tous les jours, avant `nuxt prepare` ou dans
  // un clone sans installation. Les chemins sont un enrichissement.
  it('passe au fichier suivant quand un extends est introuvable', async () => {
    const root = projectOf({
      'tsconfig.json': '{ "extends": "./absent.json" }',
      'jsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
    })

    expect(await pathsOf(root)).toEqual({ '@/*': ['src/*'] })
  })

  // Sans ce mot, l'utilisateur voit tous ses imports échouer et rien ne désigne
  // la cause, qui est dans un fichier qu'il n'a pas encore généré.
  it('avertit quand un extends introuvable fait perdre les chemins', async () => {
    const root = projectOf({ 'tsconfig.json': '{ "extends": "./.nuxt/tsconfig.json" }' })
    const dits: string[] = []

    expect(await projectPathsOf(root, (message) => dits.push(message))).toBeUndefined()
    expect(dits.join(' ')).toMatch(/tsconfig\.json.*ignor/)
  })

  // Et se tait quand le fichier suivant les fournit : annoncer une perte qui
  // n'a pas lieu vaut à peine mieux que le silence.
  it('ne dit rien quand le fichier suivant fournit les chemins', async () => {
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
  it.each([
    [
      'quand un autre fichier fournit les chemins',
      {
        'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
        'jsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
      },
    ],
    [
      'quand son extends est introuvable',
      { 'tsconfig.json': '{ "extends": "./.nuxt/tsconfig.json" }' },
    ],
  ])('surveille le tsconfig %s', async (_, fichiers) => {
    const root = projectOf({
      ...fichiers,
      'crypte.config.ts': 'export default { stories: "s", adapter: {} }',
    })
    const project = await loadProject(root)

    expect(project.watch.some((file) => file.endsWith('tsconfig.json'))).toBe(true)
  })

  it('surveille un tsconfig même sans chemins', async () => {
    const root = projectOf({
      'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
      'crypte.config.ts': 'export default { stories: "s", adapter: {} }',
    })
    const project = await loadProject(root)

    expect(project.watch.some((file) => file.endsWith('tsconfig.json'))).toBe(true)
  })

  it('nomme le fichier quand il est illisible', async () => {
    const root = projectOf({ 'tsconfig.json': '{ "compilerOptions": { paths } }' })

    await expect(projectPathsOf(root)).rejects.toThrow(ConfigError)
    await expect(projectPathsOf(root)).rejects.toThrow(/tsconfig\.json/)
  })
})

// Le pipeline CSS de Vite ne consulte aucun plugin : il résout `@import` et
// `url()` par ses propres moyens. Les chemins déclarés n'y sont donc pas
// appliqués, et un alias qui les y appliquerait court-circuiterait le repli.
// Consigné dans docs/internal/suivi.md.
describe('feuilles de style du projet', () => {
  it('n’applique pas les chemins déclarés dans un @import', async () => {
    const root = projectOf({
      'tsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
      'crypte.config.ts': 'export default { stories: "s", adapter: {} }',
      'src/app.css': "@import '@/vars.css';\n.a { color: red }",
      'src/vars.css': ':root { --x: 1 }',
    })
    const { server, close } = await serverOn(viteConfigOf(await loadProject(root)))

    try {
      await expect(server.transformRequest('/src/app.css')).rejects.toThrow()
    } finally {
      await close()
    }
  })
})

// Ce que TypeScript ne fait jamais, et que ce résolveur ne doit pas faire non
// plus : appliquer les chemins à un import relatif. Comme il passe après les
// résolveurs de Vite, seuls les imports relatifs **cassés** lui parviennent, et
// les détourner ferait charger un autre module au lieu d'échouer.
describe('imports relatifs', () => {
  // Le croisement des deux axes : le motif le plus large possible, contre les
  // natures d'identifiant qu'il ne doit pas toucher.
  it.each([
    ['un fourre-tout', '{ "*": ["src/*"] }'],
    ['un suffixe', '{ "*.css": ["src/*.css"] }'],
  ])('ne détourne pas un import relatif cassé, malgré %s', async (_, paths) => {
    const root = projectOf({
      'tsconfig.json': `{ "compilerOptions": { "paths": ${paths} } }`,
      'crypte.config.ts': 'export default { stories: "s", adapter: {} }',
      'pages/entry.js': 'import "./manquant.css"',
      'src/manquant.css': '.a { color: red }',
    })
    const { server, close } = await serverOn(viteConfigOf(await loadProject(root)))

    try {
      await expect(server.transformRequest('/pages/entry.js')).rejects.toThrow()
    } finally {
      await close()
    }
  })
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
describe('provenance de l’import', () => {
  it('n’applique pas les chemins à un fichier installé', async () => {
    const root = projectOf({
      'tsconfig.json': '{ "compilerOptions": { "paths": { "*": ["src/*"] } } }',
      'crypte.config.ts': 'export default { stories: "s", adapter: {} }',
      'src/secret-lib.js': 'export const secret = 1',
      'node_modules/dep/package.json': '{ "name": "dep", "main": "i.js" }',
      'node_modules/dep/i.js': 'import "secret-lib"\nexport const d = 1',
    })
    const { server, close } = await serverOn(viteConfigOf(await loadProject(root)))

    try {
      await expect(server.transformRequest('/node_modules/dep/i.js')).rejects.toThrow()
    } finally {
      await close()
    }
  })
})

// Les quatre provenances possibles, complétant celle du fichier installé.
// L'ordre entre le résolveur et les plugins que le projet déclare. Le repli
// rend ce choix peu risqué, mais il reste un choix, et rien ne le gardait.
describe('ordre des résolveurs', () => {
  // Le plugin est déclaré là où un projet le déclare, dans `vite.plugins` de sa
  // configuration : l'ajouter à la main court-circuiterait l'ordre qu'on teste.
  const projetAvecPlugin = (enforce: string) =>
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

  it('applique les chemins avant les plugins du projet', async () => {
    const { server, close } = await serverOn(viteConfigOf(await loadProject(projetAvecPlugin(''))))

    try {
      const resolved = await server.pluginContainer.resolveId('@/cible.js')
      expect(resolved?.id).toContain('src/cible.js')
    } finally {
      await close()
    }
  })

  // Et ce qu'un plugin fait quand il veut la main avant lui.
  it('cède la main à un plugin qui déclare enforce pre', async () => {
    const { server, close } = await serverOn(
      viteConfigOf(await loadProject(projetAvecPlugin("enforce: 'pre',"))),
    )

    try {
      const resolved = await server.pluginContainer.resolveId('@/cible.js')
      expect(resolved?.id).toContain('autre/cible.js')
    } finally {
      await close()
    }
  })
})

describe('provenance, les cas restants', () => {
  it.each([
    ['absente, une entrée du graphe', undefined],
    ['virtuelle, un module qu’un plugin a produit', '\0module-virtuel'],
    ['du projet', 'entry.js'],
  ])('applique les chemins quand elle est %s', async (_, importer) => {
    const root = projectOf({
      'tsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
      'crypte.config.ts': 'export default { stories: "s", adapter: {} }',
      'src/cible.js': 'export const c = 1',
    })
    const { server, close } = await serverOn(viteConfigOf(await loadProject(root)))

    try {
      const from = typeof importer === 'string' ? join(root, importer) : undefined
      const resolved = await server.pluginContainer.resolveId('@/cible.js', from)
      expect(resolved?.id).toContain('src/cible.js')
    } finally {
      await close()
    }
  })
})

describe('natures d’identifiant', () => {
  it.each([
    ['un nom de paquet', 'vue'],
    ['un paquet scopé', '@scope/pkg'],
    ['un sous-chemin de paquet', 'vue/dist/vue.js'],
    ['un nom avec chemin', '@/composants/Badge'],
  ])('applique les chemins à %s', (_, id) => {
    expect(isBareSpecifier(id)).toBe(true)
  })

  it.each([
    ['un relatif', './voisin.js'],
    ['un relatif remontant', '../ailleurs.js'],
    ['un absolu', '/racine.js'],
    ['une URL', 'https://cdn.example/x.js'],
    ['une source de données', 'data:text/javascript,void 0'],
    ['un module natif', 'node:fs'],
    ['un module virtuel de plugin', 'virtual:mon-module'],
    ['un identifiant virtuel de Rollup', '\0virtuel'],
    ['un fichier par URL', 'file:///tmp/x.js'],
    ['un identifiant vide', ''],
  ])('laisse passer %s', (_, id) => {
    expect(isBareSpecifier(id)).toBe(false)
  })
})

// La correspondance d'un motif, éprouvée seule : de l'extérieur, une capture
// fautive est invisible, puisque le repli renvoie l'import à Vite comme si rien
// ne s'était passé.
// Ce que l'exploration des entrées a produit : les cas dégénérés de chaque
// fonction publique, éprouvés une fois plutôt que découverts un par revue.
describe('cas dégénérés', () => {
  it.each([
    ['une racine inexistante', () => loadProject('/nexiste/pas/du/tout')],
    ['un fichier vide', () => loadProject(projectWith(''))],
    ['un export qui n’est pas un objet', () => loadProject(projectWith('export default 42'))],
    ['un fichier qui lève à l’import', () => loadProject(projectWith('throw new Error("boum")'))],
  ])('nomme le fichier pour %s', async (_, charger) => {
    await expect(charger()).rejects.toThrow(ConfigError)
    await expect(charger()).rejects.toThrow(/crypte\.config\.ts|racine/)
  })

  it('lit un extends déclaré en tableau', async () => {
    const root = projectOf({
      'a.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
      'tsconfig.json': '{ "extends": ["./a.json"] }',
    })

    expect((await projectPathsOf(root))?.paths).toEqual({ '@/*': ['src/*'] })
  })
})

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
    // La configuration réelle du CLI, non un serveur monté à la main : une
    // option ajoutée ailleurs, un alias par exemple, doit se voir ici.
    writeFileSync(join(root, 'crypte.config.ts'), 'export default { stories: "s", adapter: {} }')
    const { server, close } = await serverOn(viteConfigOf(await loadProject(root)))

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
    // La partie capturée vient de l'utilisateur : en remplacement de chaîne,
    // `$&` y désignerait le motif trouvé et produirait un autre chemin.
    ['une capture contenant $&', '{ "@/*": ["src/*"] }', 'import "@/a$&b.js"', 'src/a$&b.js'],
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

  // Un motif sans aucune cible retient quand même : TypeScript n'essaie pas le
  // motif suivant non plus, il retombe sur la résolution normale.
  it('ne se rabat pas quand le motif retenu n’a aucune cible', async () => {
    const { server, close } = await resolving('{ "@/*": [], "@*": ["src/*"] }', {
      'entry.js': 'import "@/a.js"',
      'src/a.js': 'export const x = 1',
    })

    try {
      await expect(server.transformRequest('/entry.js')).rejects.toThrow()
    } finally {
      await close()
    }
  })

  // TypeScript retient un seul motif, essaie ses substitutions, puis retombe
  // sur la résolution Node. Passer au motif suivant ferait résoudre ici ce que
  // l'éditeur du développeur déclare introuvable.
  it('ne se rabat pas sur un autre motif quand le meilleur échoue', async () => {
    const { server, close } = await resolving('{ "@/lib/*": ["absent/*"], "@/*": ["src/*"] }', {
      'entry.js': 'export { x } from "@/lib/a.js"',
      'src/lib/a.js': 'export const x = 1',
    })

    try {
      await expect(server.transformRequest('/entry.js')).rejects.toThrow()
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

    // Le préfixe d'un motif sans joker est le motif entier. Le compter à un
    // caractère près le mettrait à égalité avec le joker voisin.
    [
      'le motif exact malgré un joker de même longueur',
      '{ "#ap*": ["vendor/a.js"], "#app": ["src/lib/a.js"] }',
      'export { x } from "#app"',
      '/src/',
    ],
    // Préfixes strictement égaux : seul le départage explicite tranche, le tri
    // étant stable et l'ordre de déclaration mettant le joker en premier.
    [
      'le motif exact à préfixe égal',
      '{ "#app*": ["vendor/a.js"], "#app": ["src/lib/a.js"] }',
      'export { x } from "#app"',
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
    const { server, close } = await serverOn(viteConfigOf(project))

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

// Deux serveurs sur la même racine, celui de crypte et le `vite dev` du projet,
// écriraient le même `_metadata.json` de dépendances optimisées.
describe('le dossier de cache', () => {
  it('est propre à crypte, dans les node_modules du projet', async () => {
    const config = viteConfigOf(await loadProject(fixture))

    expect(config.cacheDir).toBe(join(fixture, 'node_modules', '.crypte'))
  })

  it('n’est pas celui que le projet utilise pour son propre serveur', async () => {
    const config = viteConfigOf(await loadProject(fixture))

    expect(config.cacheDir).not.toBe(join(fixture, 'node_modules', '.vite'))
  })
})
