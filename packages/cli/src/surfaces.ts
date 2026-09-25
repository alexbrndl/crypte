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
      } else if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
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
// would resolve against something the plugin never chose.
function fileOf(pointer: unknown): string | undefined {
  try {
    return fileURLToPath(pointer as string)
  } catch {
    return undefined
  }
}
