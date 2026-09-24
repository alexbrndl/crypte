import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, test } from 'vitest'
import { check, componentsIn, orphans, problemsOf } from '../src/check'
import { FINGERPRINT, fingerprintOf, writeFingerprint } from '../src/fingerprint'
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

// L'empreinte que `crypte dev` aurait commitée : sans elle, la commande sort en
// 1 pour cette seule raison, et masque ce que le cas mesure.
async function recorded(root: string): Promise<string> {
  writeFingerprint(root, fingerprintOf(buildCatalogue(await loadProject(root)).manifest))

  return root
}

// Un fichier qui n'exporte qu'un composant, pour ne mesurer qu'un axe à la fois.
function only(source: string): string[][] {
  const root = projectWith({ 'un.tsx': source })

  return componentsIn(join(root, 'un.tsx'))
}

describe('exports identified as components', () => {
  // Ce qui ressemble à un composant sans en être un. Chaque ligne serait un
  // faux positif, et 1.2 les interdit nommément.
  test.for([
    ['a utility function', 'export function StepFromProgress(n) { return n + 1 }'],
    ['a function that throws', 'export function Carte() { throw new Error("non") }'],
    ['an underscored name', 'export const _Carte = () => <p />'],
    ['an export without a declaration', 'const Carte = () => <p />\nexport { Carte }'],
    ['a class', 'export class Carte extends Component { render() { return <p /> } }'],
    ['a destructuring', 'export const { Carte } = tout'],
  ] as const)('does not keep %s', ([, source]) => {
    expect(only(source)).toEqual([])
  })

  // Le corps. Un composant réel écrit rarement un `return` nu au premier rang.
  test.for([
    ['a parenthesized return', 'export const A = () => (<p />)', ['A']],
    ['a fragment', 'export function A() { return <></> }', ['A']],
    ['a late return', 'export function A() { const x = 1; return <p /> }', ['A']],
    ['an early exit', 'export function A(b) { if (b) return <p />; return null }', ['A']],
    [
      'an else branch',
      'export function A(b) { if (b) { return null } else { return <p /> } }',
      ['A'],
    ],
    ['a ternary', 'export function A(b) { return b ? <p /> : null }', ['A']],
    ['a logical and', 'export function A(b) { return b && <p /> }', ['A']],
  ] as const)('keeps %s', ([, source, attendu]) => {
    expect(only(source).flat()).toEqual(attendu)
  })

  // Le regroupement lui-même, que les deux tables ci-dessus aplatissent : un
  // composant exporté deux fois rend un groupe de deux noms, pas deux groupes.
  test.for([
    ['a default written first', 'export default Carte\nexport function Carte() { return <p /> }'],
  ] as const)('groups both names of %s', ([, source]) => {
    expect(only(source)).toEqual([['Carte', 'default']])
  })

  // Deux alias pour un même composant : le défaut et un nom. Sans accumulation,
  // le second effacerait le premier et une story sur celui-là avertirait.
  test('keeps both aliases of a component that has two', () => {
    const source =
      'export function Carte() { return <p /> }\nexport default Carte\nexport { Carte as Fiche }'

    expect(only(source)).toEqual([['Carte', 'default', 'Fiche']])
  })

  // Le défaut porte son propre nom local, et le fichier peut le réexporter :
  // sans consulter les alias là aussi, une story sur `Fiche` avertirait sur
  // `default`.
  test.for([['under its own name', 'export { Carte }', ['default', 'Carte']]] as const)(
    'groups a named default re-exported %s',
    ([, second, attendu]) => {
      const source = `export default function Carte() { return <p /> }\n${second}`

      expect(only(source)).toEqual([attendu])
    },
  )

  // Un défaut anonyme ne lie aucun nom local, donc il n'y a rien à relier.
  test('links nothing to an anonymous default', () => {
    const source = 'export default () => <p />\nexport { Carte as Fiche }'

    expect(only(source)).toEqual([['default']])
  })

  // Un export de type ne nomme rien à l'exécution : une story ne peut pas le
  // viser, donc le relier grossirait le groupe sur un nom qui n'existe pas.
  test.for([
    ['on the declaration', 'export type { Carte as Fiche }'],
    ['on the specifier', 'export { type Carte as Fiche }'],
  ] as const)('does not link a type alias %s', ([, second]) => {
    const source = `export function Carte() { return <p /> }\n${second}`

    expect(only(source)).toEqual([['Carte']])
  })

  // Un nom d'export en chaîne, légal depuis ES2022. Il n'est pas lu, donc pas
  // relié : un oubli, et le sens du doute.
  test('does not link an alias written as a string', () => {
    const source = 'export function Carte() { return <p /> }\nexport { Carte as "Fiche" }'

    expect(only(source)).toEqual([['Carte']])
  })

  // Le lien ne traverse pas un réexport : le fichier ne déclare alors rien.
  test('links nothing for a default from another file', () => {
    const source =
      "export function Carte() { return <p /> }\nexport { Carte as default } from './autre'"

    expect(only(source)).toEqual([['Carte']])
  })

  test('stays silent on a missing file', () => {
    expect(componentsIn(join(projectWith({}), 'rien.tsx'))).toEqual([])
  })

  test('stays silent on a file the parser rejects', () => {
    const root = projectWith({ 'cassé.tsx': 'export const A = () => <p' })

    expect(componentsIn(join(root, 'cassé.tsx'))).toEqual([])
  })
})

describe('orphan story', () => {
  async function orphansOf(files: Record<string, string>): Promise<string[]> {
    const project = await loadProject(projectWith({ 'crypte.config.ts': CONFIG, ...files }))

    return orphans(project, storiesOf(buildCatalogue(project).manifest)).map((one) => one.file)
  }

  test('reports a declared alias whose target is gone', async () => {
    expect(
      await orphansOf({
        'jsconfig.json': ALIAS,
        'stories/Carte.ts': "import { Carte } from '@/Carte'\nexport default defineStories(Carte)",
      }),
    ).toEqual(['@/Carte'])
  })

  // Le doute de la section 8 : un identifiant que seul Vite atteint garde la
  // forme que la story a écrite, et rien ne le distingue d'un paquet installé.
  test('stays silent on an identifier no alias covers', async () => {
    expect(
      await orphansOf({
        'jsconfig.json': ALIAS,
        'stories/Carte.ts':
          "import { Carte } from 'design-system'\nexport default defineStories(Carte)",
      }),
    ).toEqual([])
  })

  test('stays silent on a bare identifier when the project declares no alias', async () => {
    expect(
      await orphansOf({
        'stories/Carte.ts':
          "import { Carte } from 'design-system'\nexport default defineStories(Carte)",
      }),
    ).toEqual([])
  })
})

describe('component without a story', () => {
  test('does not look at a folder no story cites', async () => {
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
  test('reports the neighbour, not the component linked to the default', async () => {
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
  test('does not let one namesake cover the other', async () => {
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
  test('names a component outside the root by its absolute path', async () => {
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
describe('declared wrappers', () => {
  // `loadProject` exécute la configuration, qui importe un cadre écrit en JSX.
  // Sans ce `react/jsx-runtime`, le cas ne passe que là où pnpm a hissé React
  // dans `node_modules/.pnpm/node_modules`, et échoue en CI. Mesuré.
  const composants = {
    'node_modules/react/package.json': '{ "name": "react" }',
    'node_modules/react/jsx-runtime.js': 'exports.jsx = exports.jsxs = () => null',
    'tsconfig.json': ALIAS,
    'src/Carte.tsx': 'export const Carte = () => <p />',
    'src/Cadre.tsx':
      'export const Cadre = ({ children }) => <div>{children}</div>\nexport const Ton = ({ children }) => <div>{children}</div>\nexport const Icone = () => <i />\nexport const Bouton = () => <button />',
  }

  test('stays silent on the configuration and story frames, not on the rest', async () => {
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

  test('does not let a frame cover its namesake from another file', async () => {
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

// L'empreinte commitée face à celle que donnent les stories du jour. Absente ou
// en retard, la commande sort en 1 : c'est ce qui permet à une CI de refuser une
// branche qui ne l'a pas remise à jour.
describe('fingerprint', () => {
  const projet = () =>
    projectWith({
      'crypte.config.ts': CONFIG,
      'src/Carte.tsx': 'export const Carte = () => <p />',
      'stories/Carte.ts':
        "import { Carte } from '../src/Carte'\nexport default defineStories(Carte)",
    })

  test('exits with 1 when it is missing', async () => {
    const lignes: string[] = []

    expect(await check(projet(), (line) => lignes.push(line))).toBe(1)
    expect(lignes).toEqual(['.crypte/fingerprint.json is missing: run crypte dev and commit it'])
  })

  test('exits with 1 when a story has changed since', async () => {
    const lignes: string[] = []
    const root = await recorded(projet())
    writeFileSync(
      join(root, 'stories/Carte.ts'),
      "import { Carte } from '../src/Carte'\nexport default defineStories(Carte, { stories: { Autre: {} } })",
    )

    expect(await check(root, (line) => lignes.push(line))).toBe(1)
    expect(lignes).toEqual([
      '.crypte/fingerprint.json is behind the stories: run crypte dev and commit it',
    ])
  })

  test('exits with 1 on an unreadable file', async () => {
    const root = await recorded(projet())
    const lignes: string[] = []
    writeFileSync(join(root, FINGERPRINT), '<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> autre\n')

    expect(await check(root, (line) => lignes.push(line))).toBe(1)
    expect(lignes).toEqual(['.crypte/fingerprint.json is unreadable: run crypte dev and commit it'])
  })

  test('does not count formatting as a change', async () => {
    const root = await recorded(projet())
    const fichier = join(root, FINGERPRINT)
    writeFileSync(fichier, JSON.stringify(JSON.parse(readFileSync(fichier, 'utf8'))))

    expect(await check(root, () => {})).toBe(0)
  })
})

describe('command', () => {
  test('exits with 1 on an orphan story and names it', async () => {
    const lignes: string[] = []
    const root = await recorded(
      projectWith({
        'crypte.config.ts': CONFIG,
        'stories/Carte.ts':
          "import { Carte } from '../src/Carte'\nexport default defineStories(Carte)",
      }),
    )

    expect(await check(root, (line) => lignes.push(line))).toBe(1)
    expect(lignes).toEqual(['carte--default: its component is gone, src/Carte'])
  })

  // Un fichier de story qui n'a rien donné est nommé, en avertissement : ce peut
  // être une forme correcte que le lecteur ne suit pas. Son composant n'est pas
  // accusé, et tant qu'il n'est pas lu, les composants sans story ne sont pas
  // listés. Un fichier lu en partie n'en est pas un : ses entrées nomment son
  // composant.
  test('names an unreadable story file instead of blaming its component', async () => {
    const lignes: string[] = []
    const root = await recorded(
      projectWith({
        'crypte.config.ts': CONFIG,
        'src/Carte.tsx': 'export const Carte = () => <p />',
        'src/Bouton.tsx': 'export const Bouton = () => <button />',
        'stories/Bouton.ts':
          "import { Bouton } from '../src/Bouton'\nexport default defineStories(Bouton)",
        'stories/Carte.ts':
          "import { Carte } from '../src/Carte'\nexport default defineStories(Carte, {",
      }),
    )

    expect(await check(root, (line) => lignes.push(line))).toBe(0)
    expect(lignes).toHaveLength(2)
    expect(lignes[0]).toMatch(/^stories\/Carte\.ts: this story file cannot be read, \S/)
    expect(lignes[1]).toBe(
      'components with no story are not listed while a story file cannot be read',
    )
  })

  test('does not count a partly read story file as unreadable', async () => {
    const lignes: string[] = []
    const root = await recorded(
      projectWith({
        'crypte.config.ts': CONFIG,
        'src/Carte.tsx': 'export const Carte = () => <p />',
        'src/Autre.tsx': 'export const Autre = () => <p />',
        'stories/Carte.ts':
          "import { Carte } from '../src/Carte'\nconst noms = ['b']\nexport default defineStories(Carte, { stories: { a: {}, [noms[0]]: {} } })",
      }),
    )

    expect(await check(root, (line) => lignes.push(line))).toBe(0)
    expect(lignes).toEqual(['src/Autre.tsx: Autre has no story'])
  })

  // L'avertissement ne fait jamais échouer la commande : 1.2 le dit, et un
  // projet qui ne raconte pas tout n'est pas un projet en faute.
  test('exits with 0 on a component without a story', async () => {
    const lignes: string[] = []
    const root = await recorded(
      projectWith({
        'crypte.config.ts': CONFIG,
        'src/Carte.tsx': 'export const Carte = () => <p />',
        'src/Bouton.tsx': 'export const Bouton = () => <button />',
        'stories/Carte.ts':
          "import { Carte } from '../src/Carte'\nexport default defineStories(Carte)",
      }),
    )

    expect(await check(root, (line) => lignes.push(line))).toBe(0)
    expect(lignes).toEqual(['src/Bouton.tsx: Bouton has no story'])
  })

  test('exits with 0 and says so on the fixture', async () => {
    const lignes: string[] = []

    expect(await check(fixture, (line) => lignes.push(line))).toBe(0)
    expect(lignes).toEqual(['nothing to report'])
  })

  test('returns the configuration error of a project without config', async () => {
    await expect(check(projectWith({}))).rejects.toThrow('No crypte.config.ts')
  })
})
