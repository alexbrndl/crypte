// `crypte init`: writes the `crypte.config.ts` of section 1.5 in an existing
// project. See docs/internal/architecture.md.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ConfigError } from './errors'

const CONFIG_FILE = 'crypte.config.ts'

// The adapters that exist, and the dependency that names each framework. A
// framework with no adapter cannot be configured at all, so `init` refuses
// rather than write a file `crypte dev` would reject.
const ADAPTERS = [{ dependency: 'react', package: '@crypte/react', local: 'react' }] as const

// The story roots a project may already have, in the order a reader would look.
// Posix here, and split for the file system: the string is written as is.
const ROOTS = ['stories', 'src/stories']

export interface Plan {
  adapter: (typeof ADAPTERS)[number]
  stories: string
  // Whether the root has to be created. `buildCatalogue` refuses a root that
  // does not exist, so a config naming one would not start.
  missing: boolean
  // Whether the adapter package is declared. Only a line of advice: writing the
  // config before installing is an ordinary order.
  installed: boolean
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
    installed: declared.has(adapter.package),
  }
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

// The two required keys of section 1.5, and nothing else: `css`, `wrap` and the
// plugins are the project's own answers, and guessing one writes a second
// source of truth beside the one it guessed from.
export function configFor(plan: Plan): string {
  return [
    `import { defineConfig } from '@crypte/cli'`,
    `import ${plan.adapter.local} from '${plan.adapter.package}'`,
    ``,
    `export default defineConfig({`,
    `  stories: '${plan.stories}',`,
    `  adapter: ${plan.adapter.local}(),`,
    `})`,
    ``,
  ].join('\n')
}

// What the command says it did, and what is left to the reader. No example
// story is written: it would have to name a component, and picking one is the
// guess section 1.2 refuses everywhere else.
export function linesOf(plan: Plan): string[] {
  const said = [
    `wrote ${CONFIG_FILE}`,
    `  adapter: ${plan.adapter.package}`,
    `  stories: ${plan.stories}${plan.missing ? ' (created)' : ''}`,
    `  css: not written, add it if your project has a style sheet`,
    ``,
  ]

  if (!plan.installed) {
    said.push(
      `Install the two packages first:`,
      ``,
      `  npm i -D @crypte/cli ${plan.adapter.package}`,
      ``,
    )
  }

  return [
    ...said,
    `Write a first story under \`${plan.stories}\`, then run \`crypte dev\`:`,
    ``,
    `  // ${plan.stories}/Badge.ts`,
    `  import { defineStories } from '${plan.adapter.package}'`,
    `  import { Badge } from '../src/components/Badge'`,
    ``,
    `  export default defineStories(Badge)`,
  ]
}

export function init(input: string, log: (line: string) => void = console.log): void {
  const root = resolve(input)
  const file = join(root, CONFIG_FILE)

  // Never overwritten: an existing config holds answers this command cannot
  // reconstruct, the Vite plugins first.
  if (existsSync(file)) {
    throw new ConfigError(`${CONFIG_FILE} is already there (${root}).`)
  }

  const plan = planFor(root)

  if (plan.missing) mkdirSync(join(root, ...plan.stories.split('/')), { recursive: true })
  writeFileSync(file, configFor(plan))

  for (const line of linesOf(plan)) log(line)
}
