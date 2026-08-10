#!/usr/bin/env node
import { PROTOCOL_VERSION } from '@crypte/core/protocol'

const [command] = process.argv.slice(2)

switch (command) {
  case '--version':
  case '-v':
    console.log('0.0.0')
    break
  default:
    console.log(`crypte — protocole v${PROTOCOL_VERSION}, aucune commande implémentée`)
}
