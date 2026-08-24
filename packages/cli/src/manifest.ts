// Walking the story folder and writing the catalogue the shell reads.
// See section 4 of docs/contracts.md.

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import {
  CONTRIBUTABLE,
  MANIFEST_VERSION,
  type ContributedEntry,
  type Manifest,
  type StoryEntry,
} from '@crypte/core/protocol'
import { ConfigError, reason } from './errors'
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
  // The files that produced a story at some point in this run. State of the run
  // and not of the catalogue, so it stays out of the manifest: it exists so that
  // a file which stops producing keeps saying so beyond one rebuild.
  wasStory: string[]
  // What a plugin's `entries` hook did not get to contribute, and why. Its own
  // field rather than `skipped`, whose `file` is contractually the path of a
  // story file, section 4.1. The caller reports it.
  skippedPlugins: { plugin: string; reason: string }[]
}

// The story entries of a manifest, for the three readers in this package that
// want fields only a story has. The preview's generated module filters its own.
export function storiesOf(manifest: Manifest): StoryEntry[] {
  return manifest.entries.filter((entry): entry is StoryEntry => entry.type === 'story')
}

// The story files that produced an entry, each once. Only those: the preview
// imports them by name, so a file the reader set aside must not be in the list.
export function storyFilesOf(catalogue: Catalogue): string[] {
  return [...new Set(storiesOf(catalogue.manifest).map((entry) => entry.storyFile))]
}

// `before` is the catalogue this one replaces, and it exists for one message:
// a file that produced stories and produces none any more says so. The reader
// alone cannot know it, since it judges one file at a time and a file that no
// longer names `defineStories` is indistinguishable from a helper. Without it,
// editing a story into something unreadable took it out of the tree in silence,
// which is what lot 4 closed. See docs/internal/architecture.md.
const GONE = 'this file no longer produces any story'

export function buildCatalogue(project: Project, before?: Catalogue): Catalogue {
  const storiesRoot = join(project.root, project.config.stories)
  if (!existsSync(storiesRoot)) {
    throw new ConfigError(
      `The story folder \`${project.config.stories}\` does not exist in ${project.root}.`,
    )
  }

  const entries: StoryEntry[] = []
  const skipped: Catalogue['skipped'] = []
  // The files the reader is sure meant to be stories. See `StoryFileRead.meant`.
  const sure = new Set<string>()

  // The files of this pass, which is what decides whether a story disappeared.
  const walked = new Set<string>()

  for (const file of storyFiles(storiesRoot)) {
    const read = entriesOf(file, project.root, storiesRoot)
    walked.add(posix(relative(project.root, file)))

    if (read.skipped) {
      const named = posix(relative(project.root, file))

      skipped.push({ file: named, reason: read.skipped })
      if (read.meant) sure.add(named)
    }

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
  const reasons = new Map(skipped.map((one) => [one.file, one.reason]))

  // A file that produced a story in this run and produces none now. Its own
  // reason becomes certain, whatever it is: the file is a story that stopped
  // working, not a helper the reader guessed about. With no reason at all, the
  // disappearance is the reason.
  //
  // Carried by `wasStory` rather than read from the previous entries: those lose
  // the file as soon as it stops producing, so the note lasted exactly one
  // rebuild and the next unrelated save took the banner away. Measured.
  //
  // Dropped when the file is not one of those just walked, rather than when
  // `existsSync` says it is gone: on a case-insensitive file system, renaming
  // `Badge.ts` to `badge.ts` left the old spelling existing, so the banner named
  // a file gone under that name and never went away. Measured.
  const was = (before?.wasStory ?? []).filter((file) => walked.has(file))

  for (const file of was) {
    if (gave.has(file)) continue

    sure.add(file)

    // The disappearance leads, the file's own reason follows: « no default export
    // calling defineStories » alone reads like a helper, and this file was a
    // story a moment ago. Its own reason says why it stopped.
    const why = reasons.get(file)
    const said = why === undefined ? GONE : `${GONE}: ${why}`
    const at = skipped.findIndex((one) => one.file === file)

    if (at === -1) skipped.push({ file, reason: said })
    else skipped[at] = { file, reason: said }
  }

  skipped.sort((one, other) => one.file.localeCompare(other.file, 'en'))

  // The shell sees only what is certain: a `defineStories` call that will not be
  // found, a file that does not parse, a file that stopped producing. The rest
  // stays a guess, so it goes to the terminal, which is a log at start-up and
  // not a banner above the preview.
  const certain = skipped.filter((one) => sure.has(one.file))

  // After the stories, never before: a contribution that lands on an identifier
  // a story already owns is the one that gives way, since a story comes from the
  // author's own file and a plugin's entry does not.
  const contributed = contributionsOf(project, new Set(entries.map((entry) => entry.id)))

  return {
    manifest: {
      version: MANIFEST_VERSION,
      entries: [...entries, ...contributed.entries],
      ...(certain.length > 0 ? { skipped: certain } : {}),
    },
    skipped,
    wasStory: [...new Set([...gave, ...was])],
    skippedPlugins: contributed.skipped,
  }
}

// What the `node` surface of each plugin contributes, in the order `plugins`
// declares them, and what was refused of it. Section 6.3 of docs/contracts.md.
//
// Nothing here is fatal. A plugin is not the author's text: one that throws, or
// that lands on a taken identifier, must not stop a dev server from serving the
// stories it already read.
function contributionsOf(
  project: Project,
  taken: Set<string>,
): { entries: ContributedEntry[]; skipped: Catalogue['skippedPlugins'] } {
  const entries: ContributedEntry[] = []
  const skipped: Catalogue['skippedPlugins'] = []

  for (const plugin of project.config.plugins ?? []) {
    const hook = plugin?.node?.entries
    if (!hook) continue

    // The whole loop is inside the try: a plugin that returns something other
    // than entries throws while being read, not while being called.
    try {
      const produced = hook({
        root: project.root,
        ...(project.config.css === undefined ? {} : { css: project.config.css }),
      })
      if (!Array.isArray(produced)) throw new TypeError('the hook returned no array of entries')

      for (const one of produced as unknown[]) {
        // Shape first: everything below reads `id`, and a plugin arrives
        // compiled, so nothing has checked that this is an entry at all.
        const malformed = notAnEntry(one)
        if (malformed) {
          skipped.push({ plugin: plugin.name, reason: malformed })
          continue
        }

        // Section 4.5 asks the CLI to guarantee what it writes. Everything else
        // it writes is read from source text and serialisable by construction;
        // this input is the first that is not, so the guarantee is owed here.
        const checked = serialisable(one)
        if ('offends' in checked) {
          skipped.push({ plugin: plugin.name, reason: `an entry carries ${checked.offends}` })
          continue
        }

        const entry = checked.value as ContributedEntry
        if (taken.has(entry.id))
          skipped.push({ plugin: plugin.name, reason: `\`${entry.id}\` is already taken` })
        else {
          taken.add(entry.id)
          entries.push(entry)
        }
      }
    } catch (error) {
      skipped.push({ plugin: plugin.name, reason: reason(error) })
    }
  }

  return { entries, skipped }
}

// What a plugin's return value has to be before anything else reads it.
// `ContributedEntry` holds at compile time and a plugin arrives compiled, so an
// entry typed `story` reaches here; unrefused, it would enter the manifest and,
// through `storiesOf`, the committed fingerprint.
function notAnEntry(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return 'an entry is not an object'

  const { id, type } = value as { id?: unknown; type?: unknown }

  if (typeof id !== 'string' || id === '') return 'an entry has no identifier'
  if (typeof type !== 'string' || !(CONTRIBUTABLE as readonly string[]).includes(type))
    return `\`${id}\` is not a nature a plugin may contribute`

  return undefined
}

// The first value JSON would not return as it was, named and located, or the
// value itself. Why refusing rather than dropping: docs/internal/architecture.md.
function serialisable(
  value: unknown,
  at = '',
  seen = new Set<object>(),
): { value: unknown } | { offends: string } {
  const where = at || 'the entry'

  if (value === null) return { value }
  if (value === undefined) return { offends: `undefined at ${where}` }
  if (typeof value === 'function') return { offends: `a function at ${where}` }
  if (typeof value === 'bigint' || typeof value === 'symbol')
    return { offends: `a ${typeof value} at ${where}` }

  // `JSON.stringify` writes `null` for these three, so the value that comes back
  // is a different number, or none. Dropping cannot fix that.
  if (typeof value === 'number' && !Number.isFinite(value))
    return { offends: `${String(value)} at ${where}` }

  if (typeof value !== 'object') return { value }

  // Released on the way back up, so two references to the same object are not a
  // cycle: two token names resolving to one value is the plausible case, and
  // `JSON.stringify` serialises it without complaint.
  if (seen.has(value)) return { offends: `a cycle at ${where}` }
  seen.add(value)

  try {
    if (Array.isArray(value)) {
      const out: unknown[] = []

      for (const [index, one] of value.entries()) {
        const checked = serialisable(one, `${at}[${index}]`, seen)
        if ('offends' in checked) return checked
        out.push(checked.value)
      }

      return { value: out }
    }

    // A `Date`, a `Map`, a class instance: each survives `JSON.stringify` as
    // something other than itself, so plain objects only.
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      const named = (value as { constructor?: { name?: string } }).constructor?.name
      return { offends: `a ${named ?? 'non-plain'} value at ${where}` }
    }

    const out: Record<string, unknown> = {}

    for (const [key, one] of Object.entries(value)) {
      const checked = serialisable(one, at ? `${at}.${key}` : key, seen)
      if ('offends' in checked) return checked
      out[key] = checked.value
    }

    return { value: out }
  } finally {
    seen.delete(value)
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
