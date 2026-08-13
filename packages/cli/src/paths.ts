// The paths a project declares, applied the way TypeScript applies them.
// Crypte never reads a project's `vite.config`: see docs/contracts.md, 1.5.

import { isAbsolute, resolve } from 'node:path'
import type { Plugin } from 'vite'

export interface ProjectPaths {
  paths: Record<string, string[]>
  // The folder the targets are counted from.
  base: string
  // The files read to get here, watched like the configuration.
  files: string[]
}

// An identifier carrying a protocol: `https:`, `data:`, `node:`, and the
// virtual modules a plugin declares, `virtual:` by convention.
const PROTOCOL = /^[a-z][a-z\d+.-]*:/i

// The prefix of Rollup's virtual identifiers.
const VIRTUAL = '\0'

// An installed file, so foreign to the project and to its paths.
const INSTALLED = /[\\/]node_modules[\\/]/

// A plugin rather than `resolve.alias`: an alias rewrites unconditionally,
// where TypeScript tries the target and falls back to normal resolution when it
// does not exist. That fallback is the whole difference, and `resolve.alias`
// has no equivalent. See docs/internal/architecture.md.
export function pathsPlugin({ paths, base }: ProjectPaths): Plugin {
  // TypeScript picks between two patterns by the length of their fixed prefix,
  // and a pattern with no wildcard beats every other. Without this order, `@/*`
  // wins over `@/lib/*` as soon as both targets exist.
  const ordered = Object.entries(paths).sort(([a], [b]) => {
    const parPrefixe = prefixOf(b).length - prefixOf(a).length
    if (parPrefixe !== 0) return parPrefixe

    // At equal prefix, the one with no wildcard wins: `#app` before `#app*`.
    return Number(a.includes('*')) - Number(b.includes('*'))
  })

  return {
    name: 'crypte:paths',
    async resolveId(source, importer, options) {
      // TypeScript only applies `paths` to bare module identifiers. This
      // resolver runs after Vite's own, so everything else reaches it only
      // **broken** or unresolved elsewhere: catching it would load another
      // module instead of failing. Measured on a deleted `./theme.css`.
      if (!isBareSpecifier(source)) return null

      // The project's paths only hold for its files. A dependency importing a
      // missing package, the case of an optional peer that is not installed,
      // would otherwise be served application code instead of failing.
      if (importer && INSTALLED.test(importer)) return null

      // One pattern only, the best ranked that matches. TypeScript tries its
      // substitutions then falls back to Node resolution, never to another
      // pattern: moving on would resolve here what the editor calls missing.
      const matched = best(ordered, source)
      if (!matched) return null

      const { targets, captured } = matched

      for (const target of targets) {
        // Resolution is Vite's own: the project's extensions, `index`, the
        // `exports` field, conditions. Nothing is reimplemented here.
        // A function replacer: the string form would read `$&` and its kin in
        // the captured part, which comes from the user.
        const candidate = resolve(
          base,
          target.replace('*', () => captured),
        )
        const found = await this.resolve(candidate, importer, {
          ...options,
          skipSelf: true,
        })

        if (found) return found
      }

      // The chosen pattern led nowhere: Vite carries on, the way TypeScript
      // falls back to Node resolution.
      return null
    },
  }
}

// The first pattern of the ordered list that matches, with what it captures.
// Returned together so `capture` runs once per pattern.
function best(
  ordered: [string, string[]][],
  source: string,
): { targets: string[]; captured: string } | undefined {
  for (const [pattern, targets] of ordered) {
    const captured = capture(pattern, source)
    if (captured !== null) return { targets, captured }
  }

  return undefined
}

// What paths apply to: a module name, and nothing else. The other kinds belong
// to Vite, to a plugin, or to the file system.
export function isBareSpecifier(id: string): boolean {
  if (!id) return false
  if (id.startsWith('.') || id.startsWith(VIRTUAL)) return false
  if (isAbsolute(id)) return false

  return !PROTOCOL.test(id)
}

// A pattern carries at most one wildcard: matching it comes down to comparing a
// prefix and a suffix, and returning what sits between them.
//
// Exported to be tested on its own: a wrong match is invisible from outside,
// since the fallback simply hands the import back to Vite.
export function capture(pattern: string, id: string): string | null {
  const star = pattern.indexOf('*')
  if (star === -1) return id === pattern ? '' : null

  const before = pattern.slice(0, star)
  const after = pattern.slice(star + 1)
  if (id.length < before.length + after.length) return null
  if (!id.startsWith(before) || !id.endsWith(after)) return null

  return id.slice(before.length, id.length - after.length)
}

function prefixOf(pattern: string): string {
  const star = pattern.indexOf('*')
  return star === -1 ? pattern : pattern.slice(0, star)
}
