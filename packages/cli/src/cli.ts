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
// an argument too, for the same reason; a mistyped call goes to `warn`, stderr,
// like a configuration error, so a pipe does not swallow it.
export async function run(
  argv: readonly string[],
  log: (line: string) => void = console.log,
  commands: Partial<Commands> = {},
  warn: (line: string) => void = console.error,
): Promise<number> {
  const [command, ...rest] = argv

  // Anywhere after the command too: `init --help` read `--help` as the folder.
  if (command === undefined || HELP.has(command) || rest.some((one) => HELP.has(one))) {
    for (const line of help()) log(line)
    return 0
  }

  // The command first: `serve --port` is a wrong command, not a wrong option.
  // A misspelled command in a script or a CI must fail, not print the help and
  // pass.
  const version = command === '--version' || command === '-v'
  if (!version && command !== 'dev' && command !== 'check' && command !== 'init') {
    warn(`crypte: unknown command ${command}, see crypte --help`)
    return 1
  }

  // No command takes an option yet, so anything that looks like one is a typo,
  // not a folder named `--port`. And each takes at most its root: `--version`
  // none, the three commands one.
  const option = rest.find((one) => one.startsWith('-'))
  if (option !== undefined) {
    warn(`crypte ${command}: unknown option ${option}`)
    return 1
  }
  const extra = rest[version ? 0 : 1]
  if (extra !== undefined) {
    warn(`crypte ${command}: unexpected argument ${extra}`)
    return 1
  }

  if (version) {
    log('0.0.0')
    return 0
  }

  const root = rest[0] ?? process.cwd()

  if (command === 'check') return await (commands.check ?? verify)(root, log)
  if (command === 'init') (commands.init ?? create)(root, log)
  else await (commands.dev ?? start)(root)

  return 0
}

// A configuration error is the user's mistake, not a crash: it leaves by its
// message and without a stack, which is what `ConfigError` already carries.
// Anything else is a failure, and rethrowing keeps its stack.
export function exitCode(error: unknown, say: (line: string) => void = console.error): number {
  if (!(error instanceof ConfigError)) throw error

  say(error.message)

  return 1
}
