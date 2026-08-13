// Where a project declares its paths, and which folder they count from.
// What we do with them is in `paths.ts`.

import { dirname, join, resolve } from 'node:path'
import { parse, type TSConfckParseResult } from 'tsconfck'
import { ConfigError } from './errors'
import type { ProjectPaths } from './paths'

// The two accepted names, TypeScript's and the one JavaScript projects use.
// `jsconfig.json` is not a convenience: it is the only place a project without
// TypeScript can declare its paths.
const CONFIG_NAMES = ['tsconfig.json', 'jsconfig.json']

// A made-up name: `parse` expects a file and walks up from its folder.
const PROBE = '__crypte__'

// Returns the paths if there are any, and in every case the files it read: a
// `tsconfig.json` with no `paths` still has to be watched, otherwise adding
// some would trigger no reload.
export async function readProjectPaths(
  root: string,
  warn: (message: string) => void = console.warn,
): Promise<{ paths: ProjectPaths | undefined; files: string[] }> {
  const unresolved: string[] = []
  const seen: string[] = []

  for (const configName of CONFIG_NAMES) {
    // `root` bounds the walk up: without it, a project with no configuration
    // would inherit one from some parent folder.
    // The file enters the list before it is even read: unreadable, without
    // paths, or with some, changing it changes what gets resolved, so it has
    // to trigger a reload.
    seen.push(join(root, configName))

    let result: TSConfckParseResult
    try {
      result = await parse(resolve(root, PROBE), { configName, root })
    } catch (cause) {
      // A missing `extends` target happens every day: `./.nuxt/tsconfig.json`
      // before `nuxt prepare`, or `@tsconfig/node22` in a clone with no
      // install. Paths are an improvement, not a condition to start: move on to
      // the next file rather than stopping everything.
      if ((cause as { code?: string }).code === 'EXTENDS_RESOLVE') {
        // Kept for the end: the next file may provide the paths, and warning
        // about a loss that does not happen is barely better than silence.
        unresolved.push(`${configName} extends a file that cannot be found`)
        continue
      }

      // A half-written file, or one comma too many: say so rather than let a
      // stack trace from a library surface.
      throw new ConfigError(`${configName} could not be read: ${(cause as Error).message}`, {
        cause,
      })
    }

    if (!result.tsconfigFile) continue

    seen.push(...filesOf(result))
    const found = pathsIn(result, root)
    // A file found with no paths does not end the search: a minimal
    // `tsconfig.json` would otherwise make the neighbouring `jsconfig.json`
    // unreachable. The files already walked count as much as the one that gave
    // the paths: a `tsconfig.json` with no `paths`, read first, may gain some
    // tomorrow, and it is read before the one that answers today.
    if (found) return { paths: found, files: [...new Set([...seen, ...found.files])] }
  }

  // Without this word, the user watches every import fail with nothing naming
  // the cause, which sits in a file they have not generated yet.
  for (const message of unresolved) {
    warn(`${message}: the declared paths are ignored.`)
  }

  return { paths: undefined, files: [...new Set(seen)] }
}

// The paths alone, for callers that do not need to know what was read.
export async function projectPathsOf(
  root: string,
  warn?: (message: string) => void,
): Promise<ProjectPaths | undefined> {
  return (await readProjectPaths(root, warn)).paths
}

function pathsIn(result: TSConfckParseResult, root: string): ProjectPaths | undefined {
  const own = compilerPaths(result.tsconfig)
  if (own) return { paths: own, base: baseOf(result, root), files: filesOf(result) }

  // A solution-style `tsconfig.json` declares references only, and that is
  // what `npm create vite` produces: the paths are in the referenced file, not
  // in the one we just read.
  for (const referenced of result.referenced ?? []) {
    const paths = compilerPaths(referenced.tsconfig)
    if (paths) {
      // The base too: it points at the referenced project, so changing it
      // changes the paths as much as the referenced file itself.
      return {
        paths,
        base: baseOf(referenced, root),
        files: [...filesOf(result), ...filesOf(referenced)],
      }
    }
  }

  return undefined
}

// The file read and its whole `extends` chain: changing any of them changes
// the paths, so each must trigger a reload like the configuration itself.
function filesOf(result: TSConfckParseResult): string[] {
  const chain = (result.extended ?? []).map((level) => level.tsconfigFile)
  return [...new Set([result.tsconfigFile, ...chain].filter(Boolean))]
}

// `tsconfck` makes `baseUrl` absolute, but not the paths: inherited through
// `extends`, they stay relative to the file that **declares** them. A project
// extending `@tsconfig/node22` and declaring its own would otherwise have them
// counted from `node_modules`.
function baseOf(result: TSConfckParseResult, root: string): string {
  const baseUrl = result.tsconfig?.compilerOptions?.baseUrl as string | undefined
  if (baseUrl) return baseUrl

  const declaring = declaringFile(result) ?? result.tsconfigFile
  return declaring ? dirname(declaring) : root
}

// The first file of the chain that writes `paths` itself. `extended` runs from
// the origin file to the furthest one, and each entry carries what that level
// declares, with no inheritance: only `result.tsconfig` is merged.
function declaringFile(result: TSConfckParseResult): string | undefined {
  for (const level of result.extended ?? []) {
    if (compilerPaths(level.tsconfig)) return level.tsconfigFile
  }

  return undefined
}

// An empty `paths` does not count: `"paths": {}` in a `tsconfig.json` would
// otherwise make the neighbouring `jsconfig.json` unreachable.
function compilerPaths(config: unknown): Record<string, string[]> | undefined {
  const paths = (config as { compilerOptions?: { paths?: unknown } })?.compilerOptions?.paths
  if (!paths || typeof paths !== 'object' || Object.keys(paths).length === 0) return undefined

  // A string instead of an array is a common typo, and TypeScript refuses it
  // too. Without this check, the loop walks the characters of the string and
  // looks for one file per letter, silently.
  for (const [pattern, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets) || targets.some((target) => typeof target !== 'string')) {
      throw new ConfigError(`The path \`${pattern}\` must be an array of paths.`)
    }
  }

  return paths as Record<string, string[]>
}
