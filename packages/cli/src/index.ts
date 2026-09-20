#!/usr/bin/env node
import { exitCode, run } from './cli'

// The wiring only: what the command decides lives in `cli.ts`, where a test
// reaches it without spawning a process. Code zero never calls `process.exit`:
// `crypte dev` returns while its server listens, and exiting would close it.
try {
  const code = await run(process.argv.slice(2))
  if (code !== 0) process.exit(code)
} catch (error) {
  process.exit(exitCode(error))
}
