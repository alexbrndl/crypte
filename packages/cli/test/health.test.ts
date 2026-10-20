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
    config: { stories: 'stories', adapter: {}, ...(components ? { components } : {}) },
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
