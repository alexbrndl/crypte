import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// La forme du manifeste telle que les types du protocole la déclarent : chaque
// interface qu'un manifeste porte, champ par champ avec son type, et les unions
// qui en bornent les valeurs. Lue dans le source, comme `spec.test.ts` le fait.

const protocol = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'protocol')

// Ce qu'un manifeste porte, et rien d'autre : `PropDetails` parce que
// `ResolvedPropDetails` en hérite ses champs facultatifs.
const INTERFACES = [
  'Manifest',
  'SkippedFile',
  'StoryEntry',
  'ComponentRef',
  'TokensEntry',
  'PageEntry',
  'PropDetails',
  'ResolvedPropDetails',
  'StoryMeta',
  'TokenValue',
  'TokenInTheme',
]
const ALIASES = ['ManifestEntry', 'PropKind', 'TokenKind']

export function manifestShape(): Record<string, Record<string, string> | string> {
  const source = readdirSync(protocol)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => readFileSync(join(protocol, file), 'utf8'))
    .join('\n')
  const shape: Record<string, Record<string, string> | string> = {}

  for (const name of INTERFACES) {
    const found = new RegExp(`^export interface ${name}\\b[^{]*\\{\\n([\\s\\S]*?)^\\}`, 'm').exec(
      source,
    )
    if (!found) throw new Error(`interface ${name} not found in the protocol`)
    shape[name] = Object.fromEntries(
      [...found[1]!.matchAll(/^ {2}(\w+)(\??): (.+)$/gm)].map((field) => [
        `${field[1]}${field[2]}`,
        field[3]!.trim(),
      ]),
    )
  }
  for (const name of ALIASES) {
    const found = new RegExp(`^export type ${name} =([\\s\\S]*?)(?:\\n\\n|(?![\\s\\S]))`, 'm').exec(
      source,
    )
    if (!found) throw new Error(`type ${name} not found in the protocol`)
    shape[name] = found[1]!.replace(/\s+/g, ' ').replace(/^ \| /, '').trim()
  }
  return shape
}
