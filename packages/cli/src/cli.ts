// What the `crypte` command does with its arguments.
// See docs/internal/architecture.md.

import { PROTOCOL_VERSION } from '@crypte/core/protocol'
import { dev as start } from './dev'
import { ConfigError } from './errors'

// The command as the user typed it. Taken as an argument, and so are the two
// side effects, because a test that spawns a process cannot see the printing.
export async function run(
  argv: readonly string[],
  log: (line: string) => void = console.log,
  dev: typeof start = start,
): Promise<void> {
  const [command, target] = argv

  switch (command) {
    case '--version':
    case '-v':
      log('0.0.0')
      return
    case 'dev':
      await dev(target ?? process.cwd())
      return
    default:
      log(`crypte — protocol v${PROTOCOL_VERSION}, commands: dev`)
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
