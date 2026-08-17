#!/usr/bin/env node
import { exitCode, run } from './cli'

// The wiring, and nothing else: what the command decides lives in `cli.ts`,
// where a test reaches it without spawning a process.
try {
  await run(process.argv.slice(2))
} catch (error) {
  process.exit(exitCode(error))
}
