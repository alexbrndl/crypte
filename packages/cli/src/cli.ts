// What the `crypte` command does with its arguments.

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

// What `--help` prints, and what a bare `crypte` prints. The protocol version
// is there because a plugin author reads it there.
export function help(): string[] {
  return [
    `crypte, protocol v${PROTOCOL_VERSION}`,
    '',
    'Usage: crypte <command> [root]',
    '',
    '  dev [root]     serve the workshop for the project at root',
    '  check [root]   report orphan stories, a stale fingerprint, components with no story',
    '  init [root]    write crypte.config.ts for a project that has components',
    '',
    '  --help, -h     print this help',
    '  --version, -v  print the version',
    '',
    'root defaults to the current directory.',
  ]
}

const HELP = new Set(['--help', '-h'])

// The command as the user typed it, and the exit code it deserves. Printing is
// an argument too, for the same reason.
export async function run(
  argv: readonly string[],
  log: (line: string) => void = console.log,
  commands: Partial<Commands> = {},
): Promise<number> {
  const [command, target] = argv

  // After a command too: `init --help` read `--help` as the project folder.
  if (command === undefined || HELP.has(command) || (target !== undefined && HELP.has(target))) {
    for (const line of help()) log(line)
    return 0
  }

  // No command takes an option yet, so anything that looks like one is a typo,
  // not a folder named `--port`.
  if (target?.startsWith('-')) {
    log(`crypte ${command}: unknown option ${target}`)
    return 1
  }

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
    // A misspelled command in a script or a CI must fail, not print the help
    // and pass.
    default:
      log(`crypte: unknown command ${command}, see crypte --help`)
      return 1
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
