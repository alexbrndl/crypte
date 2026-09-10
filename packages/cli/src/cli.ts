// What the `crypte` command does with its arguments.
// See docs/internal/architecture.md.

import { PROTOCOL_VERSION } from '@crypte/core/protocol'
import { check as verify } from './check'
import { dev as start } from './dev'
import { ConfigError } from './errors'
import { init as create } from './init'

// The three commands, taken as arguments so a test reaches them without a
// server, a file written or a process spawned.
export interface Commands {
  dev: typeof start
  check: typeof verify
  init: typeof create
}

// The command as the user typed it, and the exit code it deserves. Printing is
// an argument too, for the same reason.
export async function run(
  argv: readonly string[],
  log: (line: string) => void = console.log,
  commands: Partial<Commands> = {},
): Promise<number> {
  const [command, target] = argv
  const root = target ?? process.cwd()

  switch (command) {
    case '--version':
    case '-v':
      log('0.0.0')
      return 0
    case 'dev':
      await (commands.dev ?? start)(root)
      return 0
    case 'check':
      return await (commands.check ?? verify)(root, log)
    case 'init':
      ;(commands.init ?? create)(root, log)
      return 0
    default:
      log(`crypte — protocol v${PROTOCOL_VERSION}, commands: dev, check, init`)
      return 0
  }
}

// A configuration error is the user's mistake, not a crash: it leaves by its
// message and without a stack, which is what `ConfigError` already carries.
// Anything else is a failure, and rethrowing keeps its stack.
export function exitCode(error: unknown, say: (line: string) => void = console.error): number {
  if (!(error instanceof ConfigError)) throw error

  say(error.message)

  return 1
}
