// `crypte init`: writes the `crypte.config.ts` of section 1.5 in an existing
// project.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { parseSync } from 'vite'
import { ConfigError } from '../errors'
import { SKILL, SKILL_FILE } from './skill'

const CONFIG_FILE = 'crypte.config.ts'

// The adapters that exist, and the dependency that names each framework. A
// framework with no adapter cannot be configured at all, so `init` refuses
// rather than write a file `crypte dev` would reject. `vite` is the plugin the
// framework needs and its adapter does not bring, section 1.5: without it a
// `.vue` file is not compiled.
interface Known {
  dependency: string
  package: string
  local: string
  vite?: { package: string; local: string }
}

const ADAPTERS: readonly Known[] = [
  { dependency: 'react', package: '@crypte/react', local: 'react' },
  {
    dependency: 'vue',
    package: '@crypte/vue',
    local: 'vue',
    vite: { package: '@vitejs/plugin-vue', local: 'vuePlugin' },
  },
]

// The story roots a project may already have, in the order a reader would look.
// Posix here, and split for the file system: the string is written as is.
const ROOTS = ['stories', 'src/stories']

export interface Plan {
  adapter: Known
  stories: string
  // Whether the root has to be created. `buildCatalogue` refuses a root that
  // does not exist, so a config naming one would not start.
  missing: boolean
  // What the framework needs that the project does not declare, the adapter and
  // its Vite plugin. Only a line of advice: writing the config before installing
  // is an ordinary order.
  missingPackages: string[]
  // The style sheet the application's entry imports, said and never written:
  // whether it holds the tokens is the project's answer, `configFor`.
  css?: string
}

export function planFor(root: string): Plan {
  const declared = dependenciesOf(root)
  const adapter = ADAPTERS.find((one) => declared.has(one.dependency))

  if (!adapter) {
    throw new ConfigError(
      `No framework recognised in ${root}. Adapters today: ${ADAPTERS.map((one) => one.package).join(', ')}.`,
    )
  }

  const found = ROOTS.find((one) => existsSync(join(root, ...one.split('/'))))

  return {
    adapter,
    stories: found ?? ROOTS[0]!,
    missing: found === undefined,
    missingPackages: [adapter.package, ...(adapter.vite ? [adapter.vite.package] : [])].filter(
      (one) => !declared.has(one),
    ),
    ...cssOf(root),
  }
}

// The entries Vite's own templates write, and the first style sheet one imports
// by a relative path. Read by the parser, never by a pattern: an import left in
// a comment, line or block, is no import.
const ENTRIES = ['src/main.tsx', 'src/main.ts', 'src/main.jsx', 'src/main.js']

function cssOf(root: string): { css?: string } {
  for (const entry of ENTRIES) {
    const file = join(root, ...entry.split('/'))
    if (!existsSync(file)) continue
    const parsed = parseSync(file, readFileSync(file, 'utf8'))
    const found = parsed.module.staticImports
      .map((one) => one.moduleRequest.value)
      .find((source) => /^\.{1,2}\/.+\.css$/.test(source))
    if (found) return { css: posix.join(posix.dirname(entry), found) }
  }
  return {}
}

// What the project already declares. Section 0: read, never asked again.
function dependenciesOf(root: string): Set<string> {
  const file = join(root, 'package.json')
  if (!existsSync(file)) return new Set()

  let read: { dependencies?: object; devDependencies?: object }
  try {
    read = JSON.parse(readFileSync(file, 'utf8')) as typeof read
  } catch (cause) {
    throw new ConfigError(`package.json could not be read: ${(cause as Error).message}`, { cause })
  }

  return new Set([
    ...Object.keys(read?.dependencies ?? {}),
    ...Object.keys(read?.devDependencies ?? {}),
  ])
}

// The two required keys of section 1.5, and the Vite plugin a framework cannot
// render without, `vue()`. Nothing else: `css`, `wrap` and the other plugins are
// the project's own answers, and guessing one writes a second source of truth
// beside the one it guessed from.
export function configFor(plan: Plan): string {
  const { vite } = plan.adapter
  return [
    `import { defineConfig } from '@crypte/cli'`,
    `import ${plan.adapter.local} from '${plan.adapter.package}'`,
    ...(vite ? [`import ${vite.local} from '${vite.package}'`] : []),
    ``,
    `export default defineConfig({`,
    `  stories: '${plan.stories}',`,
    `  adapter: ${plan.adapter.local}(),`,
    ...(vite ? [`  vite: { plugins: [${vite.local}()] },`] : []),
    `})`,
    ``,
  ].join('\n')
}

// What the command says it did, and what is left to the reader. No example
// story is written: it would have to name a component, and picking one is the
// guess section 1.2 refuses everywhere else. For the same reason the example
// gives both import forms: copied with the wrong one, it fails at render.
export function linesOf(plan: Plan, skill = false): string[] {
  const said = [
    `wrote ${CONFIG_FILE}`,
    `  adapter: ${plan.adapter.package}`,
    `  stories: ${plan.stories}${plan.missing ? ' (created)' : ''}`,
    plan.css
      ? `  css: not written; ${plan.css}, which the application imports, is the line to add if it holds your tokens`
      : `  css: not written, add it if your project has a style sheet`,
    ...(skill
      ? [`wrote ${SKILL_FILE}, which writes stories from how the application calls a component`]
      : []),
    ``,
  ]

  if (plan.missingPackages.length > 0) {
    said.push(
      `Install what it needs first:`,
      ``,
      `  npm i -D @crypte/cli ${plan.missingPackages.join(' ')}`,
      ``,
    )
  }

  // From the story root, which may sit under `src` itself.
  const component = posix.relative(plan.stories, 'src/components/Badge')
  // A `.vue` file has one export, its default, and its extension is part of the path.
  const imports = plan.adapter.vite
    ? [`  import Badge from '${component}.vue'`]
    : [
        `  import { Badge } from '${component}'`,
        `  // or, for a component exported by default:`,
        `  // import Badge from '${component}'`,
      ]

  // What Crypte writes beside the project: two files to keep, three to ignore.
  // A whole `.crypte` cannot be ignored, it holds the committed fingerprint.
  said.push(
    `Add to .gitignore, and commit .crypte/fingerprint.json and .crypte/visual:`,
    ``,
    // `**/`: a pattern holding a slash is anchored to its `.gitignore`, and a
    // project below the repository root would commit its manifest.
    `  **/.crypte/manifest.json`,
    `  crypte-static`,
    `  crypte-visual`,
    ``,
  )

  return [
    ...said,
    `Write a first story under \`${plan.stories}\`, then run \`crypte dev\`:`,
    ``,
    `  // ${plan.stories}/Badge.ts`,
    `  import { defineStories } from '${plan.adapter.package}'`,
    ...imports,
    ``,
    `  export default defineStories(Badge)`,
  ]
}

export function init(input: string, log: (line: string) => void = console.log): void {
  const root = resolve(input)
  const file = join(root, CONFIG_FILE)

  // Never overwritten: an existing config holds answers this command cannot
  // reconstruct, the Vite plugins first. The skill alone is added to it: it
  // serves at every new component, and a project set up before it had none.
  if (existsSync(file)) {
    if (!writeSkill(root)) throw new ConfigError(`${CONFIG_FILE} is already there (${root}).`)
    log(`wrote ${SKILL_FILE}, ${CONFIG_FILE} left as it is`)
    return
  }

  const plan = planFor(root)

  if (plan.missing) mkdirSync(join(root, ...plan.stories.split('/')), { recursive: true })
  writeFileSync(file, configFor(plan))
  const skill = writeSkill(root)

  for (const line of linesOf(plan, skill)) log(line)
}

// Never over a skill already there, which its owner may have edited. Whether
// it was written.
function writeSkill(root: string): boolean {
  const file = join(root, ...SKILL_FILE.split('/'))
  if (existsSync(file)) return false
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, SKILL)
  return true
}
