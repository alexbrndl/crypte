// Les copies de projet qu'un lancement tué laisse derrière lui.
// Voir docs/internal/architecture.md.

import { globSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const restes = ['packages/cli/test/tmp-hot-*', 'packages/cli/test/tmp-dev-*', 'apps/tmp-demo-*']

export function setup() {
  for (const reste of globSync(restes, { cwd: root })) {
    rmSync(join(root, reste), { recursive: true, force: true })
  }
}
