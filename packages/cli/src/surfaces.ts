// Where each plugin's browser surfaces live, section 6.1 of docs/contracts.md.
// Read from the executed configuration: the pointer is a string, so it is the
// one part of a plugin object that survives the trip to the browser.

import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Project } from './project'

export interface Surface {
  plugin: string
  file: string
}

export interface Surfaces {
  shell: Surface[]
  preview: Surface[]
  // A surface that points nowhere, with its reason. Reported like a refused
  // contribution: a plugin must not be able to stop the server, nor fail unseen.
  refused: { plugin: string; reason: string }[]
}

// In the order `plugins` declares them, which is the order the shell shows.
export function surfacesOf(project: Project): Surfaces {
  const found: Surfaces = { shell: [], preview: [], refused: [] }

  for (const plugin of project.config.plugins ?? []) {
    for (const side of ['shell', 'preview'] as const) {
      const pointer: unknown = plugin?.[side]
      if (pointer === undefined) continue

      const file = fileOf(pointer)
      if (file === undefined) {
        found.refused.push({
          plugin: plugin.name,
          reason: `\`${side}\` must be the file URL of a module, \`new URL('./${side}.mjs', import.meta.url).href\``,
        })
      } else if (!isFile(file)) {
        found.refused.push({
          plugin: plugin.name,
          reason: `\`${side}\` points at ${file}, which is not a file`,
        })
      } else found[side].push({ plugin: plugin.name, file })
    }
  }

  return found
}

// A relative path, a plain path or an `https:` URL all throw here, and each
// would resolve against something the plugin never chose. A `URL` object too,
// which `fileURLToPath` would take: the type asks for the string.
function fileOf(pointer: unknown): string | undefined {
  if (typeof pointer !== 'string') return undefined

  try {
    return fileURLToPath(pointer)
  } catch {
    return undefined
  }
}

// Any failure, not only a missing file: a name too long or a null byte throws,
// and would stop the server the refusal exists to keep up. Measured.
function isFile(file: string): boolean {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}
