// Walking the story folder and writing the catalogue the shell reads.
// See section 4 of docs/contracts.md.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { MANIFEST_VERSION, type Manifest, type StoryEntry } from '@crypte/core/protocol'
import { ConfigError } from './errors'
import { entriesOf, STORY_EXTENSIONS } from './stories'
import type { Project } from './project'

// The build writes here, and Git ignores it: see docs/decisions.md.
export const OUTPUT = join('.crypte', 'manifest.json')

// Folders no project keeps stories in, and walking them is slow enough to be
// worth naming.
const SKIPPED_FOLDERS = new Set(['node_modules', '.git', 'dist'])

export interface Catalogue {
  manifest: Manifest
  // Story files that produced nothing, with the reason. The caller reports
  // them: a build that swallows them looks like a project with no stories.
  skipped: { file: string; reason: string }[]
}

export function buildCatalogue(project: Project): Catalogue {
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
    entries.push(...read.entries)
  }

  assertDistinct(entries)

  return { manifest: { version: MANIFEST_VERSION, entries }, skipped }
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

function posix(path: string): string {
  return path.split(/[\\/]/).join('/')
}
