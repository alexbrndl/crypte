// What the CLI knows about a project: its configuration, its aliases, and the
// Vite configuration that follows from them.

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadConfigFromFile, type InlineConfig } from 'vite'
import { readProjectPaths } from './config-paths'
import type { CrypteConfig } from './config'
import { pathsPlugin, type ProjectPaths } from './paths'
import { ConfigError } from './errors'

const CONFIG_FILE = 'crypte.config.ts'

export { ConfigError }

export interface Project {
  root: string
  config: CrypteConfig
  // Read once at load time, so the same files are not read twice.
  paths: ProjectPaths | undefined
  // The files the configuration depends on, to read it again when they change:
  // `crypte.config.ts` and what it imports, plus the TypeScript configuration
  // the paths come from.
  watch: string[]
}

export async function loadProject(input: string): Promise<Project> {
  // Normalised once here: a `crypte dev ./demo` would otherwise hand a relative
  // path to everything downstream, and the paths produced would stay relative.
  const root = resolve(input)
  const file = join(root, CONFIG_FILE)
  if (!existsSync(file)) {
    throw new ConfigError(`No ${CONFIG_FILE} at the root of the project (${root}).`)
  }

  // Vite's loader rather than one more moving part: it transpiles the file and
  // returns the dependencies to watch. It throws on a module with no default
  // export, with a message about Vite configuration: catching it is the only
  // way to name the file that is actually at fault.
  let loaded: Awaited<ReturnType<typeof loadConfigFromFile>>
  try {
    loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'development' },
      file,
      root,
      'silent',
    )
  } catch (cause) {
    throw new ConfigError(`${CONFIG_FILE} could not be loaded: ${(cause as Error).message}`, {
      cause,
    })
  }

  // Never null here: Vite returns `null` only when it has to find the file
  // itself, and we always give it one.
  const config = loaded?.config as unknown as CrypteConfig
  assertUsable(config)

  // The files read come back even with no paths: adding `paths` to an existing
  // `tsconfig.json` has to trigger a reload.
  const { paths, files } = await readProjectPaths(root)
  const watch = [...(loaded?.dependencies ?? []).map((dep) => resolve(root, dep)), ...files]

  return { root, config, paths, watch }
}

// Two fields only are required, and the error names them: section 1.5 makes
// them the product's minimum configuration.
function assertUsable(config: CrypteConfig): void {
  if (typeof config?.stories !== 'string' || config.stories === '') {
    throw new ConfigError(`${CONFIG_FILE} must declare \`stories\`, the root of the story files.`)
  }

  if (config.adapter == null) {
    throw new ConfigError(`${CONFIG_FILE} must declare \`adapter\`, the one for its framework.`)
  }

  // The optional fields too: badly typed, they throw further down on a spread
  // or a `resolve`, with an error naming neither the file nor the field.
  if (config.css !== undefined && typeof config.css !== 'string') {
    throw new ConfigError(`${CONFIG_FILE}: \`css\` must be a path.`)
  }

  for (const [field, value] of [
    ['plugins', config.plugins],
    ['vite.plugins', config.vite?.plugins],
  ] as const) {
    if (value !== undefined && !Array.isArray(value)) {
      throw new ConfigError(`${CONFIG_FILE}: \`${field}\` must be an array.`)
    }
  }
}

// The project's Vite configuration, built from its own. Nothing is guessed:
// aliases come from its TypeScript configuration, plugins from what it
// declares, and its `vite.config` is never read.
export function viteConfigOf(project: Project): InlineConfig {
  const { root, config, paths } = project

  return {
    root,
    configFile: false,
    // The resolver first, the project's plugins after: the first one only
    // catches what it truly resolves, its fallback letting the rest through, so
    // putting it in front takes nothing from anyone. A plugin that wants to run
    // before it declares `enforce: 'pre'`, which Vite honours.
    //
    // The whole set runs after Vite's own resolvers, so a path meant to replace
    // an installed package has no effect. That same order is what stops a
    // catch-all pattern from hijacking relative imports.
    plugins: [...(paths ? [pathsPlugin(paths)] : []), ...(config.vite?.plugins ?? [])],
  }
}

// The declared CSS entry, as an absolute path, or nothing if there is none.
export function cssEntryOf(project: Project): string | undefined {
  const { css } = project.config
  if (!css) return undefined

  return resolve(project.root, css)
}
