// What the shell and each plugin cost the browser, in bytes once gzipped: the
// figures of the shell's status bar. One rule for all, the one the shell budget
// of `scripts/budgets.mjs` measures, each file at level 9, so the figures add up
// and compare.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import { parse } from 'vite'
import type { Surfaces } from './surfaces'

export interface Weight {
  plugin: string
  bytes: number
}

const packed = promisify(gzip)

// Every file but the source maps, which the browser does not ask for.
export async function shellBytes(folder: string): Promise<number> {
  const files = readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((one) => one.isFile() && !one.name.endsWith('.map'))
    .map((one) => join(one.parentPath, one.name))
  const sizes = await Promise.all(
    files.map(async (file) => (await packed(readFileSync(file), { level: 9 })).length),
  )
  return sizes.reduce((total, one) => total + one, 0)
}

// Each plugin kept, in configuration order: its modules and every file they
// import, each counted once. A shell module is served as is, so it reaches only
// its relative imports; a bare one is the import map's `vue`, which the shell
// already loads. A preview module goes through Vite, which resolves the bare
// ones too: `axe-core` is most of what `a11y` weighs.
//
// A file both modules import is counted once and followed under each one's rule.
// A file two plugins import is counted in both: each figure says what removing
// that plugin alone would save. Reopened when two plugins share a dependency.
export async function pluginWeights(surfaces: Surfaces): Promise<Weight[]> {
  return Promise.all(
    surfaces.plugins.map(async (plugin) => {
      const counted = new Set<string>()
      const followed = new Set<string>()
      let bytes = 0

      const visit = async (file: string, bare: boolean) => {
        const side = `${bare}:${file}`
        if (followed.has(side)) return
        followed.add(side)
        const one = await read(file)
        if (!one) return
        if (!counted.has(file)) bytes += one.bytes
        counted.add(file)
        for (const specifier of one.imports) {
          const found = resolved(specifier, file, bare)
          if (found) await visit(found, bare)
        }
      }

      for (const one of surfaces.shell) if (one.plugin === plugin) await visit(one.file, false)
      for (const one of surfaces.preview) if (one.plugin === plugin) await visit(one.file, true)
      return { plugin, bytes }
    }),
  )
}

// Node's resolution under `require`, from the importing file. A dependency is
// counted by the file it resolves to, and the `require` calls inside it are not
// followed. Reopened when a plugin depends on a package written in CommonJS, or
// one that only resolves under the `browser` or `import` condition.
function resolved(specifier: string, from: string, bare: boolean): string | undefined {
  try {
    if (specifier.startsWith('./') || specifier.startsWith('../'))
      return fileURLToPath(new URL(specifier, pathToFileURL(from)))
    return bare ? createRequire(from).resolve(specifier) : undefined
  } catch {
    return undefined
  }
}

interface Read {
  mtimeMs: number
  size: number
  bytes: number
  imports: string[]
}

// Kept while the file stays as it is. The shell asks at each `ready`, so after
// every edit of a story, and `axe-core` alone takes some 90 ms to parse.
const reads = new Map<string, Read>()

async function read(file: string): Promise<Read | undefined> {
  let stat
  let source
  try {
    stat = statSync(file)
    const known = reads.get(file)
    if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size) return known
    source = readFileSync(file)
  } catch {
    // Nothing there, a folder, or a file it may not read: it weighs nothing.
    // Thrown, it took the list of panels down with the figures.
    return undefined
  }

  const bytes = (await packed(source, { level: 9 })).length
  const imports = await importsOf(source.toString('utf8'))
  const one = { mtimeMs: stat.mtimeMs, size: stat.size, bytes, imports }
  reads.set(file, one)
  return one
}

// The static imports and re-exports, loaded with the module. A chunk loaded by
// `import()` is not counted: reopened when a plugin splits one off. A file that
// does not parse as JavaScript, a stylesheet for one, is counted and not
// followed, and so is TypeScript, which no plugin ships yet.
//
// `parse` and not `parseAstAsync`, deprecated: on `axe-core` run beside gzip,
// the latter held the server's thread for 58 ms, so a cold start waited that
// long for its first story; `parse` holds it under 2 ms. Measured.
async function importsOf(source: string): Promise<string[]> {
  const { program } = await parse('module.js', source, { lang: 'js' })
  return program.body.flatMap((node) =>
    (node.type === 'ImportDeclaration' ||
      node.type === 'ExportAllDeclaration' ||
      node.type === 'ExportNamedDeclaration') &&
    node.source
      ? [String(node.source.value)]
      : [],
  )
}
