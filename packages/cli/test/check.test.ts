import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, test } from 'vitest'
import { check, componentsIn, orphans, problemsOf } from '../src/check'
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
  // Ce qui ressemble à un composant sans en être un. Chaque ligne serait un
  // faux positif, et 1.2 les interdit nommément.
  test.for([
    ['une fonction utilitaire', 'export function StepFromProgress(n) { return n + 1 }'],
    ['une fonction qui lève', 'export function Carte() { throw new Error("non") }'],
    ['un nom souligné', 'export const _Carte = () => <p />'],
    ['un export sans déclaration', 'const Carte = () => <p />\nexport { Carte }'],
    ['une classe', 'export class Carte extends Component { render() { return <p /> } }'],
    ['une déstructuration', 'export const { Carte } = tout'],
  ] as const)('ne retient pas %s', ([, source]) => {
    expect(only(source)).toEqual([])
  })

  // Le corps. Un composant réel écrit rarement un `return` nu au premier rang.
  test.for([
    ['un retour parenthésé', 'export const A = () => (<p />)', ['A']],
    ['un fragment', 'export function A() { return <></> }', ['A']],
    ['un retour tardif', 'export function A() { const x = 1; return <p /> }', ['A']],
    ['une sortie anticipée', 'export function A(b) { if (b) return <p />; return null }', ['A']],
    [
      'une branche sinon',
      'export function A(b) { if (b) { return null } else { return <p /> } }',
      ['A'],
    ],
    ['un ternaire', 'export function A(b) { return b ? <p /> : null }', ['A']],
    ['un et logique', 'export function A(b) { return b && <p /> }', ['A']],
  ] as const)('retient %s', ([, source, attendu]) => {
    expect(only(source).flat()).toEqual(attendu)
  })

  // Le regroupement lui-même, que les deux tables ci-dessus aplatissent : un
  // composant exporté deux fois rend un groupe de deux noms, pas deux groupes.
  test.for([
    ['un défaut écrit avant', 'export default Carte\nexport function Carte() { return <p /> }'],
  ] as const)('groupe les deux noms de %s', ([, source]) => {
    expect(only(source)).toEqual([['Carte', 'default']])
  })

  // Deux alias pour un même composant : le défaut et un nom. Sans accumulation,
  // le second effacerait le premier et une story sur celui-là avertirait.
  test('garde les deux alias d’un composant qui en porte deux', () => {
    const source =
      'export function Carte() { return <p /> }\nexport default Carte\nexport { Carte as Fiche }'

    expect(only(source)).toEqual([['Carte', 'default', 'Fiche']])
  })

  // Le défaut porte son propre nom local, et le fichier peut le réexporter :
  // sans consulter les alias là aussi, une story sur `Fiche` avertirait sur
  // `default`.
  test.for([['sous son propre nom', 'export { Carte }', ['default', 'Carte']]] as const)(
    'groupe un défaut nommé réexporté %s',
    ([, second, attendu]) => {
      const source = `export default function Carte() { return <p /> }\n${second}`

      expect(only(source)).toEqual([attendu])
    },
  )

  // Un défaut anonyme ne lie aucun nom local, donc il n'y a rien à relier.
  test('ne relie rien à un défaut anonyme', () => {
    const source = 'export default () => <p />\nexport { Carte as Fiche }'

    expect(only(source)).toEqual([['default']])
  })

  // Un export de type ne nomme rien à l'exécution : une story ne peut pas le
  // viser, donc le relier grossirait le groupe sur un nom qui n'existe pas.
  test.for([
    ['sur la déclaration', 'export type { Carte as Fiche }'],
    ['sur le spécificateur', 'export { type Carte as Fiche }'],
  ] as const)('ne relie pas un alias de type %s', ([, second]) => {
    const source = `export function Carte() { return <p /> }\n${second}`

    expect(only(source)).toEqual([['Carte']])
  })

  // Un nom d'export en chaîne, légal depuis ES2022. Il n'est pas lu, donc pas
  // relié : un oubli, et le sens du doute.
  test('ne relie pas un alias écrit en chaîne', () => {
    const source = 'export function Carte() { return <p /> }\nexport { Carte as "Fiche" }'

    expect(only(source)).toEqual([['Carte']])
  })

  // Le lien ne traverse pas un réexport : le fichier ne déclare alors rien.
  test('ne relie rien sur un défaut venu d’un autre fichier', () => {
    const source =
      "export function Carte() { return <p /> }\nexport { Carte as default } from './autre'"

    expect(only(source)).toEqual([['Carte']])
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

  // La clé est `fichier#export` : sans le fichier, une story sur l'un des deux
  // couvrirait l'autre en silence.
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
})

// Un composant que le projet déclare comme cadre, par le `wrap` de la
// configuration ou d'une story, n'attend pas de story. Ce qui le suit dans une
// paire est une valeur donnée au cadre, pas un cadre.
describe('les enveloppes déclarées', () => {
  const composants = {
    'tsconfig.json': ALIAS,
    'src/Carte.tsx': 'export const Carte = () => <p />',
    'src/Cadre.tsx':
      'export const Cadre = ({ children }) => <div>{children}</div>\nexport const Ton = ({ children }) => <div>{children}</div>\nexport const Icone = () => <i />\nexport const Bouton = () => <button />',
  }

  test('se tait sur les cadres de la configuration et des stories, pas sur le reste', async () => {
    const root = projectWith({
      ...composants,
      'crypte.config.ts':
        "import { Cadre } from './src/Cadre'\nexport default { stories: 'stories', adapter: { name: 'react' }, wrap: Cadre }\n",
      'stories/Carte.ts':
        "import { Carte } from '@/Carte'\nimport { Ton, Icone } from '../src/Cadre'\nexport default defineStories(Carte, { wrap: [[Ton, { icone: Icone }]] })",
    })

    expect(problemsOf(await loadProject(root))).toEqual([
      { kind: 'unstoried', file: 'src/Cadre.tsx', name: 'Icone' },
      { kind: 'unstoried', file: 'src/Cadre.tsx', name: 'Bouton' },
    ])
  })

  test('ne laisse pas un cadre couvrir son homonyme d’un autre fichier', async () => {
    const root = projectWith({
      ...composants,
      'src/autre/Ton.tsx': 'export const Ton = ({ children }) => <div>{children}</div>',
      'crypte.config.ts': CONFIG,
      'stories/Carte.ts':
        "import { Carte } from '@/Carte'\nimport { Ton } from '@/autre/Ton'\nexport default defineStories(Carte, { wrap: Ton })",
    })

    expect(problemsOf(await loadProject(root)).map((one) => one.name)).toEqual([
      'Cadre',
      'Ton',
      'Icone',
      'Bouton',
    ])
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
