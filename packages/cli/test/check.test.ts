import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, test } from 'vitest'
import { check, componentsIn, linesOf, orphans, problemsOf } from '../src/check'
import { buildCatalogue, storiesOf } from '../src/manifest'
import { loadProject } from '../src/project'

// Les deux problèmes de la section 1.2 : la story orpheline, qui fait sortir en
// 1, et le composant sans story, qui avertit. Le second ne regarde que les
// exports identifiés comme composants, et se tait sur tout le reste.

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, 'fixture')

const temporary: string[] = []

afterAll(() => {
  for (const root of temporary) rmSync(root, { recursive: true, force: true })
})

function projectWith(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-check-')))

  for (const [name, content] of Object.entries(files)) {
    const file = join(root, name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }

  temporary.push(root)

  return root
}

const CONFIG = "export default { stories: 'stories', adapter: { name: 'react' } }\n"

const ALIAS = JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } })

// Un fichier qui n'exporte qu'un composant, pour ne mesurer qu'un axe à la fois.
function only(source: string): string[][] {
  const root = projectWith({ 'un.tsx': source })

  return componentsIn(join(root, 'un.tsx'))
}

describe('les exports identifiés comme composants', () => {
  // La forme d'export. Le nom est capitalisé partout ici : c'est l'autre axe.
  test.for([
    ['une fonction nommée', 'export function Carte() { return <p /> }', ['Carte']],
    ['une flèche', 'export const Carte = () => <p />', ['Carte']],
    ['une expression de fonction', 'export const Carte = function () { return <p /> }', ['Carte']],
    ['une flèche annotée', 'export const Carte: FC = () => <p />', ['Carte']],
    ['un défaut nommé', 'export default function Carte() { return <p /> }', ['default']],
    ['un défaut anonyme', 'export default () => <p />', ['default']],
    [
      'deux exports du même fichier',
      'export const A = () => <p />\nexport const B = () => <i />',
      ['A', 'B'],
    ],
  ] as const)('retient %s', ([, source, attendu]) => {
    expect(only(source).flat()).toEqual(attendu)
  })

  // Ce qui ressemble à un composant sans en être un. Chaque ligne serait un
  // faux positif, et 1.2 les interdit nommément.
  test.for([
    ['une constante capitalisée', 'export const CARTE = 3'],
    ['un objet capitalisé', 'export const Carte = { nom: 1 }'],
    ['une fonction utilitaire', 'export function StepFromProgress(n) { return n + 1 }'],
    ['une fonction qui rend une chaîne', 'export const Carte = () => "texte"'],
    ['une fonction qui ne rend rien', 'export const Carte = () => null'],
    ['une fonction qui lève', 'export function Carte() { throw new Error("non") }'],
    ['une fonction minuscule', 'export function carte() { return <p /> }'],
    ['un nom souligné', 'export const _Carte = () => <p />'],
    ['un défaut littéral', 'export default 42'],
    ['un export sans déclaration', 'const Carte = () => <p />\nexport { Carte }'],
    ['une classe', 'export class Carte extends Component { render() { return <p /> } }'],
    ['une déstructuration', 'export const { Carte } = tout'],
    ['un composant enveloppé', 'export const Carte = memo(Brute)'],
    ['un composant réexporté', "export { Carte } from './Carte'"],
  ] as const)('ne retient pas %s', ([, source]) => {
    expect(only(source)).toEqual([])
  })

  // Le corps. Un composant réel écrit rarement un `return` nu au premier rang.
  test.for([
    ['un retour parenthésé', 'export const A = () => (<p />)', ['A']],
    ['un bloc', 'export function A() { return <p /> }', ['A']],
    ['un fragment', 'export function A() { return <></> }', ['A']],
    ['un retour tardif', 'export function A() { const x = 1; return <p /> }', ['A']],
    ['une sortie anticipée', 'export function A(b) { if (b) return <p />; return null }', ['A']],
    ['une branche en bloc', 'export function A(b) { if (b) { return <p /> } return null }', ['A']],
    [
      'une branche sinon',
      'export function A(b) { if (b) { return null } else { return <p /> } }',
      ['A'],
    ],
    ['un ternaire', 'export function A(b) { return b ? <p /> : null }', ['A']],
    ['un et logique', 'export function A(b) { return b && <p /> }', ['A']],
    [
      'un enfant en boucle',
      'export function A(l) { return <ul>{l.map((i) => <li />)}</ul> }',
      ['A'],
    ],
  ] as const)('retient %s', ([, source, attendu]) => {
    expect(only(source).flat()).toEqual(attendu)
  })

  // Ce que la lecture syntaxique ne suit pas. Ce sont des oublis, pas des faux
  // positifs, et 1.2 préfère l'oubli : les fixer demanderait le flot de contrôle.
  test.for([
    ['un retour dans une boucle', 'export function A(l) { for (const i of l) { return <p /> } }'],
    ['un retour dans un try', 'export function A() { try { return <p /> } catch { return null } }'],
    ['un appel à createElement', 'export function A() { return createElement("p") }'],
  ] as const)('laisse passer %s, et c’est le sens du doute', ([, source]) => {
    expect(only(source)).toEqual([])
  })

  // Le regroupement lui-même, que les deux tables ci-dessus aplatissent : un
  // composant exporté deux fois rend un groupe de deux noms, pas deux groupes.
  test.for([
    [
      'un défaut qui reprend un nommé',
      'export function Carte() { return <p /> }\nexport default Carte',
    ],
    [
      'un défaut par liste',
      'export function Carte() { return <p /> }\nexport { Carte as default }',
    ],
    ['un défaut écrit avant', 'export default Carte\nexport function Carte() { return <p /> }'],
  ] as const)('groupe les deux noms de %s', ([, source]) => {
    expect(only(source)).toEqual([['Carte', 'default']])
  })

  // Le lien ne traverse pas un réexport : le fichier ne déclare alors rien.
  test('ne relie rien sur un défaut venu d’un autre fichier', () => {
    const source =
      "export function Carte() { return <p /> }\nexport { Carte as default } from './autre'"

    expect(only(source)).toEqual([['Carte']])
  })

  // Un composant que seul le défaut exporte reste introuvable : c'est un oubli,
  // pas un faux avertissement, et 1.2 préfère l'oubli.
  test('ne retient pas un composant local que seul le défaut exporte', () => {
    expect(only('function Carte() { return <p /> }\nexport default Carte')).toEqual([])
  })

  test('se tait sur un fichier absent', () => {
    expect(componentsIn(join(projectWith({}), 'rien.tsx'))).toEqual([])
  })

  test('se tait sur un fichier que l’analyseur refuse', () => {
    const root = projectWith({ 'cassé.tsx': 'export const A = () => <p' })

    expect(componentsIn(join(root, 'cassé.tsx'))).toEqual([])
  })
})

describe('la story orpheline', () => {
  async function orphansOf(files: Record<string, string>): Promise<string[]> {
    const project = await loadProject(projectWith({ 'crypte.config.ts': CONFIG, ...files }))

    return orphans(project, storiesOf(buildCatalogue(project).manifest)).map((one) => one.file)
  }

  test('ne signale rien quand le composant est là', async () => {
    expect(
      await orphansOf({
        'src/Carte.tsx': 'export const Carte = () => <p />',
        'stories/Carte.ts':
          "import { Carte } from '../src/Carte'\nexport default defineStories(Carte)",
      }),
    ).toEqual([])
  })

  test('signale un chemin relatif que rien ne résout', async () => {
    expect(
      await orphansOf({
        'stories/Carte.ts':
          "import { Carte } from '../src/Carte'\nexport default defineStories(Carte)",
      }),
    ).toEqual(['../src/Carte'])
  })

  test('signale un alias déclaré dont la cible a disparu', async () => {
    expect(
      await orphansOf({
        'jsconfig.json': ALIAS,
        'stories/Carte.ts': "import { Carte } from '@/Carte'\nexport default defineStories(Carte)",
      }),
    ).toEqual(['@/Carte'])
  })

  // Le doute de la section 8 : un identifiant que seul Vite atteint garde la
  // forme que la story a écrite, et rien ne le distingue d'un paquet installé.
  test('se tait sur un identifiant qu’aucun alias ne couvre', async () => {
    expect(
      await orphansOf({
        'jsconfig.json': ALIAS,
        'stories/Carte.ts':
          "import { Carte } from 'design-system'\nexport default defineStories(Carte)",
      }),
    ).toEqual([])
  })

  test('se tait sur un identifiant nu quand le projet ne déclare aucun alias', async () => {
    expect(
      await orphansOf({
        'stories/Carte.ts':
          "import { Carte } from 'design-system'\nexport default defineStories(Carte)",
      }),
    ).toEqual([])
  })
})

describe('le composant sans story', () => {
  // Le périmètre vient des dossiers que les stories citent déjà : la section 0
  // interdit de redéclarer une racine de composants.
  test('avertit sur un voisin du composant déjà raconté', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'src/Carte.tsx': 'export const Carte = () => <p />',
      'src/Bouton.tsx': 'export const Bouton = () => <button />',
      'stories/Carte.ts':
        "import { Carte } from '../src/Carte'\nexport default defineStories(Carte)",
    })

    expect(problemsOf(await loadProject(root))).toEqual([
      { kind: 'unstoried', file: 'src/Bouton.tsx', name: 'Bouton' },
    ])
  })

  test('ne regarde pas un dossier qu’aucune story ne cite', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'src/Carte.tsx': 'export const Carte = () => <p />',
      'src/ailleurs/Bouton.tsx': 'export const Bouton = () => <button />',
      'stories/Carte.ts':
        "import { Carte } from '../src/Carte'\nexport default defineStories(Carte)",
    })

    expect(problemsOf(await loadProject(root))).toEqual([])
  })

  // La clé est `fichier#export` : sans le fichier, une story sur l'un des deux
  // couvrirait l'autre en silence.
  // Un composant exporté deux fois est un seul composant. La story désigne l'un
  // des deux noms, et sans ce lien la commande avertit sur l'autre : un faux
  // avertissement sur un composant qui a bien une story.
  test.for([
    [
      'un défaut qui reprend un nommé',
      'export function Carte() { return <p /> }\nexport default Carte',
    ],
    [
      'un défaut par liste',
      'export function Carte() { return <p /> }\nexport { Carte as default }',
    ],
  ] as const)('se tait sur %s dont la story vise le défaut', async ([, source]) => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'src/Carte.tsx': source,
      'stories/Carte.ts': "import Carte from '../src/Carte'\nexport default defineStories(Carte)",
    })

    expect(problemsOf(await loadProject(root))).toEqual([])
  })

  // Et dans l'autre sens : la story vise le nommé, le défaut ne doit pas être
  // signalé pour autant.
  test('se tait sur le défaut quand la story vise le nom', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'src/Carte.tsx': 'export function Carte() { return <p /> }\nexport default Carte',
      'stories/Carte.ts':
        "import { Carte } from '../src/Carte'\nexport default defineStories(Carte)",
    })

    expect(problemsOf(await loadProject(root))).toEqual([])
  })

  // Le lien ne vaut que pour le composant que le défaut reprend : un voisin
  // exporté dans le même fichier reste sans story.
  test('signale le voisin, pas le composant relié au défaut', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'src/Carte.tsx':
        'export function Carte() { return <p /> }\nexport const Bouton = () => <button />\nexport default Carte',
      'stories/Carte.ts': "import Carte from '../src/Carte'\nexport default defineStories(Carte)",
    })

    expect(problemsOf(await loadProject(root))).toEqual([
      { kind: 'unstoried', file: 'src/Carte.tsx', name: 'Bouton' },
    ])
  })

  test('ne laisse pas un homonyme couvrir l’autre', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'src/Carte.tsx': 'export const Carte = () => <p />',
      'src/Carte.copie.tsx': 'export const Carte = () => <p />',
      'stories/Carte.ts':
        "import { Carte } from '../src/Carte'\nexport default defineStories(Carte)",
    })

    expect(problemsOf(await loadProject(root))).toEqual([
      { kind: 'unstoried', file: 'src/Carte.copie.tsx', name: 'Carte' },
    ])
  })

  // Le composant hors de la racine : un dépôt où les stories vivent dans un
  // paquet et les composants dans un autre. `relative` y rend une chaîne de
  // `..`, illisible dans un message, donc le chemin absolu est rendu tel quel.
  test('nomme un composant hors de la racine par son chemin absolu', async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-hors-')))
    temporary.push(base)
    mkdirSync(join(base, 'app'), { recursive: true })
    mkdirSync(join(base, 'partagé'), { recursive: true })
    writeFileSync(join(base, 'app', 'crypte.config.ts'), CONFIG)
    writeFileSync(join(base, 'partagé', 'Carte.tsx'), 'export const Carte = () => <p />')
    writeFileSync(join(base, 'partagé', 'Bouton.tsx'), 'export const Bouton = () => <button />')
    mkdirSync(join(base, 'app', 'stories'), { recursive: true })
    writeFileSync(
      join(base, 'app', 'stories', 'Carte.ts'),
      "import { Carte } from '../../partagé/Carte'\nexport default defineStories(Carte)",
    )

    expect(problemsOf(await loadProject(join(base, 'app')))).toEqual([
      { kind: 'unstoried', file: join(base, 'partagé', 'Bouton.tsx'), name: 'Bouton' },
    ])
  })

  // Deux mécanismes donnent ce résultat, et le filtre d'extensions n'est pas
  // celui qui décide : l'analyseur refuse `.vue` et `.css` de toute façon.
  // Mesuré, le retirer ne fait rougir aucun cas. Il reste pour ce qu'il fait
  // vraiment, éviter la lecture. Voir docs/internal/architecture.md.
  test('se tait sur un fichier d’une autre extension', async () => {
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'src/Carte.tsx': 'export const Carte = () => <p />',
      'src/Bouton.vue': '<template><button /></template>',
      'src/theme.css': '.a { color: red }',
      'stories/Carte.ts':
        "import { Carte } from '../src/Carte'\nexport default defineStories(Carte)",
    })

    expect(problemsOf(await loadProject(root))).toEqual([])
  })
})

describe('la commande', () => {
  test('sort en 1 sur une story orpheline et la nomme', async () => {
    const lignes: string[] = []
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'stories/Carte.ts':
        "import { Carte } from '../src/Carte'\nexport default defineStories(Carte)",
    })

    expect(await check(root, (line) => lignes.push(line))).toBe(1)
    expect(lignes).toEqual(['carte--default: its component is gone, ../src/Carte'])
  })

  // L'avertissement ne fait jamais échouer la commande : 1.2 le dit, et un
  // projet qui ne raconte pas tout n'est pas un projet en faute.
  test('sort en 0 sur un composant sans story', async () => {
    const lignes: string[] = []
    const root = projectWith({
      'crypte.config.ts': CONFIG,
      'src/Carte.tsx': 'export const Carte = () => <p />',
      'src/Bouton.tsx': 'export const Bouton = () => <button />',
      'stories/Carte.ts':
        "import { Carte } from '../src/Carte'\nexport default defineStories(Carte)",
    })

    expect(await check(root, (line) => lignes.push(line))).toBe(0)
    expect(lignes).toEqual(['src/Bouton.tsx: Bouton has no story'])
  })

  test('sort en 0 et le dit sur la fixture', async () => {
    const lignes: string[] = []

    expect(await check(fixture, (line) => lignes.push(line))).toBe(0)
    expect(lignes).toEqual(['nothing to report'])
  })

  test('rend l’erreur de configuration d’un projet sans config', async () => {
    await expect(check(projectWith({}))).rejects.toThrow('No crypte.config.ts')
  })
})

describe('ce que la commande imprime', () => {
  test('le dit quand il n’y a rien', () => {
    expect(linesOf([])).toEqual(['nothing to report'])
  })

  test('nomme la story pour un orphelin et le fichier pour un composant', () => {
    expect(
      linesOf([
        { kind: 'orphan', file: 'src/Carte.tsx', name: 'carte--default' },
        { kind: 'unstoried', file: 'src/Bouton.tsx', name: 'Bouton' },
      ]),
    ).toEqual([
      'carte--default: its component is gone, src/Carte.tsx',
      'src/Bouton.tsx: Bouton has no story',
    ])
  })
})
