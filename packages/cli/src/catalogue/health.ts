// What the health view reads: every component of the folder `components`
// declares (1.5), the stories that cover it, and for one without a story the
// file that would give it one. Computed from the project and Git alone, so a
// build writes it as a file as `crypte dev` serves it.

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import type { StoryEntry, StoryMeta } from '@crypte/core/protocol'
import { parseSync } from 'vite'
import { componentsIn, wrappers } from '../commands/check'
import type { Project } from '../config/project'
import { componentFile } from './manifest'
import { scriptOf } from './vue-props'
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
  // Those a story must give: with none, `defineStories(Component)` is enough.
  required: number
  // Its first story's, as the sidebar filter reads it.
  status?: NonNullable<StoryMeta['status']>
  // The last commit that touched its file, ISO. Absent outside Git, or for a file
  // never committed.
  changed?: string
  // The last commit that wrote its status into its story file.
  statusSince?: string
  // What a story file for it would hold, when it has none.
  skeleton?: { file: string; source: string }
  // The components of the folder that import it, `file:export` as the shell
  // keys them, an index re-exporting it followed: where a deprecated one is
  // still used. Absent when none does.
  usedBy?: string[]
}

// Opened, not counted: `componentsIn` keeps only what returns an element, and
// counts a `.vue` file as one component.
const READ = ['.tsx', '.jsx', '.ts', '.js', '.vue']
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
  // Two walks of the history for the whole folder, never one per file: a call
  // costs about 11 ms on a short history, and the dev server waits for them.
  const changes = lastCommits(project.root, ['--', folder])
  const statuses = lastCommits(project.root, [
    `-Gstatus:[[:space:]]*['"](draft|stable|deprecated)['"]`,
    '-E',
    '--',
    project.config.stories,
  ])
  const files = filesIn(join(project.root, folder))
  const importers = importersOf(project, files, frames)
  const found: HealthComponent[] = []
  for (const file of files) {
    for (const names of componentsIn(file)) {
      if (names.some((one) => frames.has(`${file}#${one}`))) continue
      const covered = names.flatMap((one) => covering.get(`${file}#${one}`) ?? [])
      const exported = names[0]!
      const status = covered[0]?.meta?.status
      const { details } = propsOf(file, exported)
      const changed = changes.get(named(project.root, file))
      const since = status && covered[0] ? statuses.get(covered[0].storyFile) : undefined
      const usedBy = [
        ...new Set(
          names.flatMap((one) => importers.get(`${named(project.root, file)}#${one}`) ?? []),
        ),
      ].sort()
      found.push({
        name: exported === 'default' ? basename(file, extname(file)) : exported,
        file: named(project.root, file),
        export: exported,
        stories: covered.map((entry) => entry.id),
        props: Object.keys(details).length,
        required: Object.values(details).filter((one) => one.required).length,
        ...(status ? { status } : {}),
        ...(changed ? { changed } : {}),
        ...(since ? { statusSince: since } : {}),
        ...(covered.length === 0 ? { skeleton: skeletonOf(project, folder, file, exported) } : {}),
        ...(usedBy.length > 0 ? { usedBy } : {}),
      })
    }
  }
  return { components: found }
}

// Who imports what, among the files of the folder: for the `file#export` a
// component file declares, the components using it, `file:export`. An import is
// resolved as a story's is, then followed through the re-exports of an index,
// named or `export *`, to the file declaring it. It goes to the components of
// the importing file whose declaration names it; to all of them when none can
// be read, an `export { Card }` of a value built elsewhere for instance. A frame
// declared as `wrap`, a namespace import and a file importing itself name nobody.
function importersOf(
  project: Project,
  files: string[],
  frames: Set<string>,
): Map<string, string[]> {
  const read = files.flatMap((file) => {
    try {
      const text = readFileSync(file, 'utf8')
      // A `.vue` file imports from its script block, the `setup` one when it has
      // two: an import in the plain block beside it is not seen.
      if (file.endsWith('.vue')) {
        const script = scriptOf(file, text)
        return script && !('unread' in script)
          ? [
              {
                file,
                self: named(project.root, file),
                source: script.content,
                parsed: script.parsed,
              },
            ]
          : []
      }
      const parsed = parseSync(file, text)
      return parsed.errors.length > 0
        ? []
        : [{ file, self: named(project.root, file), source: text, parsed }]
    } catch {
      return []
    }
  })

  const declared = new Set<string>()
  const forward = new Map<string, string>()
  const star = new Map<string, string[]>()
  // Every file of the folder, not only those whose script parsed: a `.vue` file
  // made of its template alone is still a component its importers use.
  for (const file of files)
    for (const names of componentsIn(file))
      for (const one of names) declared.add(`${named(project.root, file)}#${one}`)
  for (const { file, self, parsed } of read) {
    for (const one of parsed.module.staticExports) {
      for (const entry of one.entries) {
        if (!entry.moduleRequest) continue
        const target = componentFile(entry.moduleRequest.value, file, project)
        if (entry.importName.kind === 'Name' && entry.exportName.kind === 'Name')
          forward.set(`${self}#${entry.exportName.name}`, `${target}#${entry.importName.name}`)
        else if (entry.exportName.kind === 'None')
          star.set(self, [...(star.get(self) ?? []), target])
      }
    }
  }
  // Bounded: two indexes re-exporting each other would otherwise loop.
  const origin = (key: string, depth = 0): string | undefined => {
    if (declared.has(key)) return key
    if (depth > 8) return undefined
    const next = forward.get(key)
    if (next) return origin(next, depth + 1)
    const at = key.lastIndexOf('#')
    for (const target of star.get(key.slice(0, at)) ?? []) {
      const found = origin(`${target}${key.slice(at)}`, depth + 1)
      if (found) return found
    }
    return undefined
  }

  const found = new Map<string, string[]>()
  for (const { file, self, source, parsed } of read) {
    const spans = spansOf(parsed.program.body as unknown as Statement[])
    const own = componentsIn(file)
      .filter((names) => !names.some((one) => frames.has(`${file}#${one}`)))
      .map((names) => ({
        key: `${self}:${names[0]}`,
        span: names.map((one) => spans.get(one)).find((one) => one !== undefined),
      }))
    if (own.length === 0) continue
    for (const one of parsed.module.staticImports) {
      const target = componentFile(one.moduleRequest.value, file, project)
      if (target === self) continue
      for (const entry of one.entries) {
        const imported =
          entry.importName.kind === 'Default'
            ? 'default'
            : entry.importName.kind === 'Name'
              ? entry.importName.name
              : undefined
        const key = imported === undefined ? undefined : origin(`${target}#${imported}`)
        if (key === undefined) continue
        const word = new RegExp(
          `(?<![\\w$])${entry.localName.value.replaceAll('$', '\\$')}(?![\\w$])`,
        )
        const users = own.some((component) => component.span)
          ? own.filter(({ span }) => span && word.test(source.slice(span[0], span[1])))
          : own
        found.set(key, [...(found.get(key) ?? []), ...users.map((user) => user.key)])
      }
    }
  }
  return found
}

interface Statement {
  type: string
  start: number
  end: number
  id?: { name: string } | null
  declarations?: { id: { name?: string }; start: number; end: number }[]
  declaration?: Statement | null
  name?: string
}

// Where each top-level function or constant is declared, by name, and the
// default export under `default`.
function spansOf(body: Statement[]): Map<string, [number, number]> {
  const spans = new Map<string, [number, number]>()
  const declare = (one: Statement | null | undefined) => {
    if (!one) return
    if (one.type === 'FunctionDeclaration' && one.id) spans.set(one.id.name, [one.start, one.end])
    for (const declarator of one.declarations ?? [])
      if (declarator.id.name) spans.set(declarator.id.name, [declarator.start, declarator.end])
  }
  for (const one of body) {
    declare(one)
    if (one.type === 'ExportNamedDeclaration') declare(one.declaration)
  }
  for (const one of body) {
    if (one.type !== 'ExportDefaultDeclaration' || !one.declaration) continue
    const value = one.declaration
    const span =
      value.type === 'Identifier' && value.name ? spans.get(value.name) : [value.start, value.end]
    if (span) spans.set('default', span as [number, number])
  }
  return spans
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
// it by a relative path, which needs no alias. The component says which adapter:
// a `.vue` file is Vue's, keeps its extension in the import, and its story file
// is a `.ts` one; anything else is React's.
function skeletonOf(project: Project, folder: string, file: string, exported: string) {
  const vue = file.endsWith('.vue')
  const inside = relative(join(project.root, folder), file)
  const target = join(
    project.root,
    project.config.stories,
    vue ? inside.replace(/\.vue$/, '.ts') : inside,
  )
  let path = relative(dirname(target), file).split(sep).join('/')
  path = (path.startsWith('.') ? path : `./${path}`).replace(/\.[jt]sx?$/, '')
  const local = exported === 'default' ? basename(file, extname(file)) : exported
  const imported = exported === 'default' ? local : `{ ${exported} }`
  const adapter = vue ? '@crypte/vue' : '@crypte/react'
  return {
    file: named(project.root, target),
    source: `import { defineStories } from '${adapter}'\nimport ${imported} from '${path}'\n\nexport default defineStories(${local})\n`,
  }
}

// The date of the last commit that touched each file the arguments select, by
// project-relative path, newest first so the first seen wins. A status line
// changed last is the one that set the status a file holds. Nothing outside Git,
// or for what was never committed: the column stays empty.
function lastCommits(root: string, args: string[]): Map<string, string> {
  const dates = new Map<string, string>()
  let log: string
  try {
    // Unquoted: Git writes a path holding anything but ASCII between quotes, escaped,
    // and `Bouté.tsx` would match no file.
    log = execFileSync(
      'git',
      [
        '-c',
        'core.quotePath=false',
        'log',
        '--relative',
        '--format=%x00%cI',
        '--name-only',
        ...args,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 64 * 1024 * 1024,
      },
    )
  } catch {
    return dates
  }
  for (const commit of log.split('\0').slice(1)) {
    const [date = '', ...files] = commit.trim().split('\n')
    const at = Date.parse(date)
    if (Number.isNaN(at)) continue
    for (const file of files)
      if (file && !dates.has(file)) dates.set(file, new Date(at).toISOString())
  }
  return dates
}

function named(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}
