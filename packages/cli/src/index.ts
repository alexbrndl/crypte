#!/usr/bin/env node
import { exitCode, run } from './cli'

// The wiring, and nothing else: what the command decides lives in `cli.ts`,
// where a test reaches it without spawning a process.
//
// Zero never calls `process.exit`: `crypte dev` returns as soon as the server
// listens, and exiting there would close it.
try {
  const code = await run(process.argv.slice(2))
  if (code !== 0) process.exit(code)
} catch (error) {
  process.exit(exitCode(error))
}
