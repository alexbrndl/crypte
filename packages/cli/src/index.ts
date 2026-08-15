#!/usr/bin/env node
import { PROTOCOL_VERSION } from '@crypte/core/protocol'
import { dev } from './dev'
import { ConfigError } from './errors'

const [command, target] = process.argv.slice(2)

// A configuration error is the user's mistake, not a crash: it leaves by its
// message and without a stack, which is what `ConfigError` already carries.
async function main() {
  switch (command) {
    case '--version':
    case '-v':
      console.log('0.0.0')
      return
    case 'dev':
      await dev(target ?? process.cwd())
      return
    default:
      console.log(`crypte — protocol v${PROTOCOL_VERSION}, commands: dev`)
  }
}

try {
  await main()
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message)
    process.exit(1)
  }

  throw error
}
