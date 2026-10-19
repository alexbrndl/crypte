// What the health view reads: every component of the folder `components`
// declares (1.5), the stories that cover it, and for one without a story the
// file that would give it one. Computed from the project and Git alone, so a
// build writes it as a file as `crypte dev` serves it.

import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import type { StoryEntry, StoryMeta } from '@crypte/core/protocol'
import { componentsIn, wrappers } from '../commands/check'
import type { Project } from '../config/project'
import { propsOf } from './props'

export interface Health {
  // `null` when the configuration declares no `components` folder: with nothing
  // to count against, the stories gauge has no denominator and is not drawn.
  components: HealthComponent[] | null
}

export interface HealthComponent {
  name: string
  // Project-relative, with `/` whatever the system.
  file: string
  export: string
  // The ids of the stories that render it.
  stories: string[]
  props: number
  // Its first story's, as the sidebar filter reads it.
  status?: NonNullable<StoryMeta['status']>
  // The last commit that touched its file, ISO. Absent outside Git, or for a file
  // never committed.
  changed?: string
  // The last commit that wrote its status into its story file.
  statusSince?: string
  // What a story file for it would hold, when it has none.
  skeleton?: { file: string; source: string }
}

// Opened, not counted: `componentsIn` keeps only what returns an element. A Vue
// file is not read, so a Vue project's gauge counts nothing yet (section 8).
const READ = ['.tsx', '.jsx', '.ts', '.js']
const SKIPPED = new Set(['node_modules', '.git', 'dist'])

export function healthOf(project: Project, stories: StoryEntry[]): Health {
  const folder = project.config.components
  if (folder === undefined) return { components: null }

  const covering = new Map<string, StoryEntry[]>()
  for (const entry of stories) {
    const key = `${join(project.root, entry.component.file)}#${entry.component.export}`
    covering.set(key, [...(covering.get(key) ?? []), entry])
  }

  // A frame the project declares as `wrap` is context, not a component missing
  // its story, as for `crypte check`.
  const frames = wrappers(project, stories)
  const found: HealthComponent[] = []
  for (const file of filesIn(join(project.root, folder))) {
    for (const names of componentsIn(file)) {
      if (names.some((one) => frames.has(`${file}#${one}`))) continue
      const covered = names.flatMap((one) => covering.get(`${file}#${one}`) ?? [])
      const exported = names[0]!
      const status = covered[0]?.meta?.status
      const changed = lastCommit(project.root, ['--', file])
      const since =
        status && covered[0]
          ? lastCommit(project.root, [
              `-Gstatus:[[:space:]]*['"]${status}['"]`,
              '--',
              join(project.root, covered[0].storyFile),
            ])
          : undefined
      found.push({
        name: exported === 'default' ? basename(file, extname(file)) : exported,
        file: named(project.root, file),
        export: exported,
        stories: covered.map((entry) => entry.id),
        props: Object.keys(propsOf(file, exported).details).length,
        ...(status ? { status } : {}),
        ...(changed ? { changed } : {}),
        ...(since ? { statusSince: since } : {}),
        ...(covered.length === 0 ? { skeleton: skeletonOf(project, folder, file, exported) } : {}),
      })
    }
  }
  return { components: found }
}

// Sorted, so two machines write the same file.
function filesIn(folder: string): string[] {
  let entries
  try {
    entries = readdirSync(folder, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .sort((one, other) => one.name.localeCompare(other.name, 'en'))
    .flatMap((entry) => {
      const path = join(folder, entry.name)
      if (entry.isDirectory()) return SKIPPED.has(entry.name) ? [] : filesIn(path)
      return READ.includes(extname(entry.name)) && !entry.name.endsWith('.d.ts') ? [path] : []
    })
}

// The story file mirrors the component's place under the story root, and imports
// it by a relative path, which needs no alias. `@crypte/react` is the only
// adapter there is; reopened with a second one.
function skeletonOf(project: Project, folder: string, file: string, exported: string) {
  const inside = relative(join(project.root, folder), file)
  const target = join(project.root, project.config.stories, inside)
  let path = relative(dirname(target), file).split(sep).join('/')
  path = (path.startsWith('.') ? path : `./${path}`).replace(/\.[jt]sx?$/, '')
  const local = exported === 'default' ? basename(file, extname(file)) : exported
  const imported = exported === 'default' ? local : `{ ${exported} }`
  return {
    file: named(project.root, target),
    source: `import { defineStories } from '@crypte/react'\nimport ${imported} from '${path}'\n\nexport default defineStories(${local})\n`,
  }
}

// The commit date Git gives, or nothing: outside Git, or for what was never
// committed, the column stays empty.
function lastCommit(root: string, args: string[]): string | undefined {
  try {
    const date = execFileSync('git', ['log', '-1', '--format=%cI', ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const at = Date.parse(date)
    return Number.isNaN(at) ? undefined : new Date(at).toISOString()
  } catch {
    return undefined
  }
}

function named(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}
