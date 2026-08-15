// Copie le shell construit dans `dist/shell`, où `serve.ts` le cherche.
//
// Le shell est une application privée, pas un paquet publié : la décision et ses
// raisons sont dans docs/decisions.md. D'où cette copie, et d'où la dépendance
// de développement sur `@crypte/shell`, qui n'existe que pour que `vp run -r
// pack` construise le shell avant ce script. Voir docs/internal/architecture.md.

import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cli = dirname(dirname(fileURLToPath(import.meta.url)))
const built = join(cli, '..', '..', 'apps', 'shell', 'dist')
const into = join(cli, 'dist', 'shell')

if (!existsSync(join(built, 'index.html'))) {
  console.error(
    `Le shell n'est pas construit : ${built} n'a pas d'index.html.\n` +
      'Lance `vp run -r pack` à la racine, qui construit le shell avant ce script.',
  )
  process.exit(1)
}

rmSync(into, { recursive: true, force: true })
cpSync(built, into, { recursive: true })

console.log(`shell copié dans ${into.slice(cli.length + 1)}`)
