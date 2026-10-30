import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { healthOf } from '../src/catalogue/health'
import { buildCatalogue, storiesOf } from '../src/catalogue/manifest'
import type { Project } from '../src/config/project'

// Ce que la vue santé lit : les composants du dossier déclaré, leurs stories, et
// les dates que Git en donne.

const dossiers: string[] = []
afterEach(() => {
  for (const root of dossiers.splice(0)) rmSync(root, { recursive: true, force: true })
})

function projet(fichiers: Record<string, string>, components?: string): Project {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'crypte-health-')))
  dossiers.push(root)
  for (const [nom, source] of Object.entries({ 'stories/.gitkeep': '', ...fichiers })) {
    mkdirSync(dirname(join(root, nom)), { recursive: true })
    writeFileSync(join(root, nom), source)
  }
  return {
    root,
    config: {
      stories: 'stories',
      adapter: { mount() {}, unmount() {} },
      ...(components ? { components } : {}),
    },
    paths: undefined,
    watch: [],
  }
}

const git = (root: string, date: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
    {
      cwd: root,
      stdio: 'ignore',
      env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date },
    },
  )

const santé = (project: Project) =>
  healthOf(project, storiesOf(buildCatalogue(project).manifest)).components

const BADGE =
  'export function Badge({ label }: { label: string; tone?: string }) { return <b>{label}</b> }\n'
const SELECT = 'export default function Select() { return <select /> }\n'
const HISTOIRE = (statut: string) =>
  `import { defineStories } from '@crypte/react'\nimport { Badge } from '../src/components/Badge'\nimport { Frame } from '../src/components/Frame'\n\nexport default defineStories(Badge, {\n  wrap: Frame,\n  meta: { status: '${statut}' },\n  stories: { Default: { label: 'a' }, Long: { label: 'b' } },\n})\n`

describe('the components the health view counts', () => {
  test('counts nothing without a components folder', () => {
    expect(santé(projet({ 'src/components/Badge.tsx': BADGE }))).toBeNull()
  })

  // À toute profondeur ; une story couvre son composant, l'autre reçoit le fichier
  // qui lui en donnerait une.
  test('lists every component under the folder, with its stories or a skeleton', () => {
    const project = projet(
      {
        'src/components/Badge.tsx': BADGE,
        'src/components/form/Select.tsx': SELECT,
        'src/components/form/Select.d.ts': 'export declare function Select(): JSX.Element\n',
        'src/components/node_modules/x/Hidden.tsx': SELECT,
        // Un cadre déclaré en `wrap` est un contexte, pas un composant sans story.
        'src/components/Frame.tsx':
          'export function Frame({ children }: { children: unknown }) { return <div>{children}</div> }\n',
        'stories/Badge.tsx': HISTOIRE('draft'),
      },
      'src/components',
    )

    expect(santé(project)).toEqual([
      {
        name: 'Badge',
        file: 'src/components/Badge.tsx',
        export: 'Badge',
        stories: ['badge--default', 'badge--long'],
        props: 2,
        required: 1,
        status: 'draft',
        unexercised: ['tone'],
      },
      {
        name: 'Select',
        file: 'src/components/form/Select.tsx',
        export: 'default',
        stories: [],
        props: 0,
        required: 0,
        skeleton: {
          file: 'stories/form/Select.tsx',
          source:
            "import { defineStories } from '@crypte/react'\nimport Select from '../../src/components/form/Select'\n\nexport default defineStories(Select)\n",
        },
      },
    ])
  })

  // Où un composant est encore utilisé : les composants du dossier qui
  // l'importent, par défaut ou par son nom. Un import d'espace de noms ne nomme
  // aucun export, un fichier qui s'importe lui-même ne s'utilise pas.
  test('names the components of the folder that import one', () => {
    const composants = santé(
      projet(
        {
          'src/components/Badge.tsx': BADGE,
          'src/components/form/Select.tsx': SELECT,
          'src/components/Card.tsx':
            "import { Badge } from './Badge'\nimport Select from './form/Select'\nexport function Card() { return <div><Badge label='a' /><Select /></div> }\n",
          'src/components/Tout.tsx':
            "import * as tout from './Badge'\nimport { Tout as Moi } from './Tout'\nexport function Tout() { return <tout.Badge label='a' /> }\n",
          'src/components/Casse.tsx': "import { Badge } from './Badge'\nexport function {\n",
        },
        'src/components',
      ),
    )!
    expect(composants.map((one) => [one.name, one.usedBy])).toEqual([
      ['Badge', ['src/components/Card.tsx:Card']],
      ['Card', undefined],
      ['Select', ['src/components/Card.tsx:Card']],
      ['Tout', undefined],
    ])
  })

  // Le cas courant d'une bibliothèque : un index qui réexporte, par son nom ou
  // en bloc. Un frame déclaré en `wrap` n'est pas un composant à reprendre ;
  // dans un fichier à deux composants, seul celui qui nomme l'import l'utilise,
  // un nom local en $ compris.
  test('follows an index, leaves a frame out, and names the component that uses the import', () => {
    const composants = santé(
      projet(
        {
          'src/components/Badge.tsx': BADGE,
          'src/components/Tag.tsx': 'export function Tag() { return <i /> }\n',
          'src/components/Frame.tsx':
            "import { Badge } from './Badge'\nexport function Frame({ children }: { children: unknown }) { return <div><Badge label='f' />{children}</div> }\n",
          'src/components/index.ts': "export { Badge } from './Badge'\nexport * from './Tag'\n",
          'src/components/Card.tsx':
            "import { Badge as $B, Tag } from '.'\nexport function Card() { return <div><$B label='a' /><Tag /></div> }\n",
          'src/components/Multi.tsx':
            "import { Badge } from './index'\nexport function A() { return <Badge label='a' /> }\nexport function B() { return <p /> }\n",
          'stories/Badge.tsx': HISTOIRE('deprecated'),
        },
        'src/components',
      ),
    )!
    expect(composants.map((one) => [one.name, one.usedBy])).toEqual([
      ['Badge', ['src/components/Card.tsx:Card', 'src/components/Multi.tsx:A']],
      ['Card', undefined],
      ['A', undefined],
      ['B', undefined],
      ['Tag', ['src/components/Card.tsx:Card']],
    ])
  })

  test('names a folder that is not there as empty', () => {
    expect(santé(projet({}, 'src/missing'))).toEqual([])
  })

  // La date du dernier commit qui touche le composant, et celle du commit qui a
  // écrit son statut dans le fichier de stories.
  test('dates the last change of a component and the setting of its status', () => {
    const project = projet(
      {
        'src/components/Badge.tsx': BADGE,
        'stories/Badge.tsx': HISTOIRE('draft'),
        // Un nom hors ASCII, que Git écrirait entre guillemets.
        'src/components/Étiquette.tsx': 'export function Étiquette() { return <i /> }\n',
      },
      'src/components',
    )
    const root = project.root
    git(root, '2026-08-03T10:00:00Z', 'init', '-q', '-b', 'main')
    git(root, '2026-08-03T10:00:00Z', 'add', '-A')
    git(root, '2026-08-03T10:00:00Z', 'commit', '-qm', 'a')
    writeFileSync(join(root, 'stories/Badge.tsx'), HISTOIRE('stable'))
    git(root, '2026-09-12T10:00:00Z', 'commit', '-qam', 'b')
    writeFileSync(join(root, 'src/components/Badge.tsx'), `${BADGE}// touched\n`)
    git(root, '2026-10-14T10:00:00Z', 'commit', '-qam', 'c')
    // Une story renommée sans toucher au statut : la date du statut ne bouge pas.
    writeFileSync(join(root, 'stories/Badge.tsx'), HISTOIRE('stable').replace('Long', 'Longue'))
    git(root, '2026-10-15T10:00:00Z', 'commit', '-qam', 'd')

    expect(santé(project)?.find((one) => one.name === 'Étiquette')?.changed).toBe(
      '2026-08-03T10:00:00.000Z',
    )
    expect(santé(project)?.[0]).toMatchObject({
      status: 'stable',
      changed: '2026-10-14T10:00:00.000Z',
      statusSince: '2026-09-12T10:00:00.000Z',
    })
  })
})

// Un projet Vue : chaque `.vue` est un composant, nommé par son fichier, avec ses
// props, un squelette de story pour Vue, et les `.vue` qui l'importent.
describe('a Vue project', () => {
  const VUE_BADGE =
    '<script setup lang="ts">\ndefineProps<{ label: string }>()\n</script>\n<template><b /></template>\n'
  const VUE_CARD =
    '<script setup lang="ts">\nimport Badge from \'./Badge.vue\'\n</script>\n<template><Badge label="x" /></template>\n'

  // Un `.vue` réduit à son template, ou au script illisible, reste un composant
  // que ses importateurs utilisent.
  test('names the importers of a .vue file whose script cannot be read', () => {
    const composants = santé(
      projet(
        {
          'src/components/Feuille.vue': '<template><b /></template>',
          'src/components/Casse.vue':
            '<script setup lang="ts">const = </script><template><i /></template>',
          'src/components/Page.vue':
            "<script setup lang=\"ts\">\nimport Feuille from './Feuille.vue'\nimport Casse from './Casse.vue'\n</script>\n<template><Feuille /><Casse /></template>\n",
        },
        'src/components',
      ),
    )

    expect(Object.fromEntries((composants ?? []).map((one) => [one.name, one.usedBy]))).toEqual({
      Casse: ['src/components/Page.vue:default'],
      Feuille: ['src/components/Page.vue:default'],
      Page: undefined,
    })
  })

  test('counts each .vue file, with its props, its importers and a Vue skeleton', () => {
    const composants = santé(
      projet(
        {
          'src/components/Badge.vue': VUE_BADGE,
          'src/components/ui/Card.vue': VUE_CARD.replace('./Badge.vue', '../Badge.vue'),
          'stories/ui/Card.ts':
            "import { defineStories } from '@crypte/vue'\nimport Card from '../../src/components/ui/Card.vue'\n\nexport default defineStories(Card)\n",
        },
        'src/components',
      ),
    )

    expect(
      composants?.map(({ name, file, export: exported, stories, props, required, usedBy }) => ({
        name,
        file,
        exported,
        stories,
        props,
        required,
        usedBy,
      })),
    ).toEqual([
      {
        name: 'Badge',
        file: 'src/components/Badge.vue',
        exported: 'default',
        stories: [],
        props: 1,
        required: 1,
        usedBy: ['src/components/ui/Card.vue:default'],
      },
      {
        name: 'Card',
        file: 'src/components/ui/Card.vue',
        exported: 'default',
        stories: ['ui/card--default'],
        props: 0,
        required: 0,
        usedBy: undefined,
      },
    ])
    expect(composants?.[0]?.skeleton).toEqual({
      file: 'stories/Badge.ts',
      source:
        "import { defineStories } from '@crypte/vue'\nimport Badge from '../src/components/Badge.vue'\n\nexport default defineStories(Badge)\n",
    })
  })
})

// La page couverture : les props qu'aucune story ne donne, et les fichiers de
// l'application qui importent chaque composant.
// Les propriétés que lit chaque composant, story ou pas : le dashboard croise
// composants et tokens pour tous, là où le manifeste ne les lit que pour ceux qui
// ont une story.
describe('the tokens of a component', () => {
  const LU =
    "import './Badge.css'\nexport function Badge() { return <b style={{ color: 'var(--accent)' }} /> }\n"
  const NU = 'export function Nu() { return <i>--pas-lu</i> }\n'

  test('lists them with a story and without, as the manifest reads them', () => {
    const project = projet(
      {
        'src/components/Badge.tsx': LU,
        'src/components/Badge.css': 'b { gap: var(--space-2); }\n',
        'src/components/Seul.tsx': LU.replaceAll('Badge', 'Seul'),
        'src/components/Seul.css': 'i { margin: var(--space-4); }\n',
        'src/components/Nu.tsx': NU,
        'stories/Badge.tsx':
          "import { defineStories } from '@crypte/react'\nimport { Badge } from '../src/components/Badge'\n\nexport default defineStories(Badge)\n",
      },
      'src/components',
    )
    const lus = Object.fromEntries(santé(project)!.map((one) => [one.name, one.tokens]))

    expect(lus).toEqual({
      Badge: ['accent', 'space-2'],
      Seul: ['accent', 'space-4'],
      Nu: undefined,
    })
    const [entrée] = storiesOf(buildCatalogue(project).manifest)
    expect(entrée!.component.tokens).toEqual(lus['Badge'])
  })

  test('gives two components of one file what the file reads', () => {
    const lus = santé(
      projet(
        {
          'src/components/Paire.tsx':
            "export function A() { return <b style={{ gap: 'var(--un)' }} /> }\nexport function B() { return <i /> }\n",
        },
        'src/components',
      ),
    )!.map((one) => one.tokens)

    expect(lus).toEqual([['un'], ['un']])
  })
})

describe('the coverage of a component', () => {
  const BOUTON =
    'export function Bouton({ label, tone, size }: { label: string; tone?: string; size?: number }) { return <button>{label}</button> }\n'
  const histoire = (stories: string) =>
    `import { defineStories } from '@crypte/react'\nimport { Bouton } from '../src/components/Bouton'\n\nexport default defineStories(Bouton, {\n  props: { label: 'a' },\n  stories: ${stories},\n})\n`

  // Le bloc partagé compte, comme ce que chaque story ajoute ; sans story, tout
  // manque et rien n'est dit de plus que « sans story ».
  test.for([
    [
      'a story gives one prop beyond the shared block',
      "{ Default: {}, Ton: { tone: 'x' } }",
      ['size'],
    ],
    ['every prop is given', "{ Default: { tone: 'x', size: 1 } }", undefined],
  ] as const)('%s', ([, stories, manque]) => {
    const [bouton] = santé(
      projet(
        { 'src/components/Bouton.tsx': BOUTON, 'stories/Bouton.tsx': histoire(stories) },
        'src/components',
      ),
    )!
    expect(bouton!.unexercised).toEqual(manque)
  })

  test('says nothing more of a component with no story', () => {
    const [bouton] = santé(projet({ 'src/components/Bouton.tsx': BOUTON }, 'src/components'))!
    expect(bouton!.unexercised).toBeUndefined()
  })

  // Par un chemin relatif ou un index, une fois par fichier. Ni les stories, ni le
  // dossier des composants, ni `node_modules`, un dossier caché ou ce que
  // `crypte build` écrit ne sont l'application.
  test('lists the files of the application that import it, once each', () => {
    const [bouton, index] = santé(
      projet(
        {
          'src/components/Bouton.tsx': BOUTON,
          'src/components/index.ts': "export { Bouton } from './Bouton'\n",
          'src/pages/Accueil.tsx':
            "import { Bouton } from '../components/Bouton'\nimport { Bouton as B } from '../components'\nexport const Accueil = () => <Bouton label='a' />\n",
          'src/pages/Aide.tsx':
            "import { Bouton } from '../components'\nexport const Aide = () => <Bouton label='a' />\n",
          'src/pages/Rien.tsx': 'export const Rien = () => null\n',
          'stories/Bouton.tsx': histoire('{ Default: {} }'),
          'node_modules/lib/x.tsx': "import { Bouton } from '../../src/components/Bouton'\n",
          '.cache/x.tsx': "import { Bouton } from '../src/components/Bouton'\n",
          'crypte-static/x.js': "import { Bouton } from '../src/components/Bouton'\n",
        },
        'src/components',
      ),
    )!
    expect(bouton!.usedIn).toEqual(['src/pages/Accueil.tsx', 'src/pages/Aide.tsx'])
    expect(index).toBeUndefined()
  })

  // La racine des stories, telle que la configuration l'écrit : avec sa barre
  // finale, ou le projet entier, '.', où vit aussi l'application. Les fichiers
  // de story sortent par leur nom ; ni un test, ni un composant du dossier
  // n'est l'application.
  test.for(['stories', 'stories/', '.'])(
    'reads the application with a story root of %j',
    (racine) => {
      const project = projet(
        {
          'src/components/Bouton.tsx': BOUTON,
          'src/components/Carte.tsx':
            "import { Bouton } from './Bouton'\nexport function Carte() { return <Bouton label='a' /> }\n",
          'src/pages/Accueil.tsx':
            "import { Bouton } from '../components/Bouton'\nexport const Accueil = () => <Bouton label='a' />\n",
          'src/pages/Accueil.test.tsx': "import { Bouton } from '../components/Bouton'\n",
          'src/__tests__/x.tsx': "import { Bouton } from '../components/Bouton'\n",
          'stories/Bouton.tsx': histoire('{ Default: {} }'),
        },
        'src/components',
      )
      project.config.stories = racine
      const [bouton] = santé(project)!
      expect(bouton!.usedIn).toEqual(['src/pages/Accueil.tsx'])
    },
  )

  // Un spread cache ce qu'il donne (4.2) : rien n'est dit plutôt qu'un faux nom.
  test('says nothing of the props when a story spreads an object', () => {
    const [bouton] = santé(
      projet(
        {
          'src/components/Bouton.tsx': BOUTON,
          'stories/Bouton.tsx': histoire("{ Default: { ...{ tone: 'x' } } }"),
        },
        'src/components',
      ),
    )!
    expect(bouton!.unexercised).toBeUndefined()
  })

  test('says nothing of a component the application never imports', () => {
    const [bouton] = santé(projet({ 'src/components/Bouton.tsx': BOUTON }, 'src/components'))!
    expect(bouton!.usedIn).toBeUndefined()
  })
})
