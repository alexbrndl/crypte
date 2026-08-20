// Walking the story folder and writing the catalogue the shell reads.
// See section 4 of docs/contracts.md.

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { MANIFEST_VERSION, type Manifest, type StoryEntry } from '@crypte/core/protocol'
import { ConfigError } from './errors'
import { best, isBareSpecifier, ordered } from './paths'
import { entriesOf, posix, STORY_EXTENSIONS } from './stories'
import type { Project } from './project'

// The build writes here, and Git ignores it: see docs/decisions.md.
export const OUTPUT = join('.crypte', 'manifest.json')

// Folders no project keeps stories in, and walking them is slow enough to be
// worth naming.
const SKIPPED_FOLDERS = new Set(['node_modules', '.git', 'dist'])

export interface Catalogue {
  manifest: Manifest
  // What a story file could not produce, with the reason, whether it produced
  // nothing at all or only part of its stories. The caller reports it: a build
  // that swallows this looks like a project with fewer stories than it has.
  skipped: { file: string; reason: string }[]
}

// The story files that produced an entry, each once. Only those: the preview
// imports them by name, so a file the reader set aside must not be in the list.
export function storyFilesOf(catalogue: Catalogue): string[] {
  return [...new Set(catalogue.manifest.entries.map((entry) => entry.storyFile))]
}

// `before` is the catalogue this one replaces, and it exists for one message:
// a file that produced stories and produces none any more says so. The reader
// alone cannot know it, since it judges one file at a time and a file that no
// longer names `defineStories` is indistinguishable from a helper. Without it,
// editing a story into something unreadable took it out of the tree in silence,
// which is what lot 4 closed. See docs/internal/architecture.md.
export function buildCatalogue(project: Project, before?: Catalogue): Catalogue {
  const storiesRoot = join(project.root, project.config.stories)
  if (!existsSync(storiesRoot)) {
    throw new ConfigError(
      `The story folder \`${project.config.stories}\` does not exist in ${project.root}.`,
    )
  }

  const entries: StoryEntry[] = []
  const skipped: Catalogue['skipped'] = []

  for (const file of storyFiles(storiesRoot)) {
    const read = entriesOf(file, project.root, storiesRoot)

    if (read.skipped)
      skipped.push({ file: posix(relative(project.root, file)), reason: read.skipped })

    // Once per file, not once per story: every entry of a file names the same
    // component, and each resolution probes the file system.
    //
    // It is also the second guard against handing the resolver its own output.
    // A project-relative path is a bare identifier too, so it would go back
    // through the `paths` patterns and could land on another file. The first
    // guard is in `entriesOf`, where each entry owns its `component`.
    const resolved = read.entries[0]
      ? componentFile(read.entries[0].component.file, file, project)
      : undefined

    for (const entry of read.entries) {
      if (resolved !== undefined) entry.component = { ...entry.component, file: resolved }
      entries.push(entry)
    }
  }

  assertDistinct(entries)

  const gave = new Set(entries.map((entry) => entry.storyFile))
  const said = new Set(skipped.map((one) => one.file))

  for (const file of new Set((before?.manifest.entries ?? []).map((entry) => entry.storyFile))) {
    if (gave.has(file) || said.has(file)) continue

    skipped.push({ file, reason: 'this file no longer produces any story' })
  }

  skipped.sort((one, other) => one.file.localeCompare(other.file, 'en'))

  // `skipped` travels in the manifest too, not only in the caller's output: the
  // terminal is not where somebody looks for a story they cannot find. Absent
  // rather than empty, so a project with nothing to say writes the same manifest
  // as before. Section 4.1 of docs/contracts.md.
  return {
    manifest: { version: MANIFEST_VERSION, entries, ...(skipped.length > 0 ? { skipped } : {}) },
    skipped,
  }
}

export function writeCatalogue(root: string, manifest: Manifest): string {
  const file = join(root, OUTPUT)

  mkdirSync(join(root, '.crypte'), { recursive: true })
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)

  return file
}

// Sorted at every level, so two machines walking the same folder write the same
// file. `readdirSync` gives no order of its own.
export function storyFiles(folder: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )) {
    const path = join(folder, entry.name)

    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name)) found.push(...storyFiles(path))
    } else if (STORY_EXTENSIONS.includes(extname(entry.name))) {
      found.push(path)
    }
  }

  return found
}

// The extensions tried on a target that carries none, in `resolve.extensions`
// order, which vite@8.2.1 documents as its default. Any other order resolves a
// component here and another one in the preview, on a project holding both
// `Card.ts` and `Card.js`.
//
// `.vue` is last and is ours: it is not in that documented default. A Vue
// project resolves its components thanks to it, and putting it last keeps every
// extension Vite does list ahead of it.
const RESOLVED = ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.vue']

// The story names its component with the identifier the project writes, alias
// included. Section 4.2 promises a file, so the identifier is turned into one.
//
// This is not Vite's resolver: it runs with no plugin and no `exports` field,
// because the manifest is written before any server exists. It covers what a
// component import looks like, and hands back the identifier untouched when it
// finds nothing. `crypte check` is what will report the orphan case.
export function componentFile(specifier: string, storyFile: string, project: Project): string {
  const found = candidates(specifier, storyFile, project)
    .map(probe)
    .find((file) => file !== undefined)

  return found ? posix(relative(project.root, found)) : specifier
}

function candidates(specifier: string, storyFile: string, project: Project): string[] {
  if (!isBareSpecifier(specifier)) return [resolve(dirname(storyFile), specifier)]

  const paths = project.paths
  if (!paths) return []

  const matched = best(ordered(paths.paths), specifier)
  if (!matched) return []

  return matched.targets.map((target) =>
    resolve(
      paths.base,
      target.replace('*', () => matched.captured),
    ),
  )
}

// A target with no extension is a file to complete, or a folder holding an
// `index`. Both are what an import of a component looks like.
//
// Every file before any `index`, the order Node and Vite use. Interleaving the
// two made `Card/index.tsx` win over `Card.js`.
function probe(candidate: string): string | undefined {
  if (extname(candidate) && isFile(candidate)) return candidate

  for (const extension of RESOLVED) {
    if (isFile(candidate + extension)) return candidate + extension
  }

  for (const extension of RESOLVED) {
    const index = join(candidate, `index${extension}`)
    if (isFile(index)) return index
  }

  return undefined
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile()
}

// Two stories can carry different names and land on the same identifier, since
// `storyId` folds case and accents. That identifier is a URL, a baseline key
// and a comment anchor, so a collision has to be named, not resolved silently.
function assertDistinct(entries: StoryEntry[]): void {
  const seen = new Map<string, StoryEntry>()

  for (const entry of entries) {
    const first = seen.get(entry.id)

    if (first) {
      throw new ConfigError(
        `Two stories share the identifier \`${entry.id}\`: ` +
          `"${first.name}" in ${first.storyFile} and "${entry.name}" in ${entry.storyFile}. ` +
          'Rename one of them.',
      )
    }

    seen.set(entry.id, entry)
  }
}
