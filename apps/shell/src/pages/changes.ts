// Ce que sert `/@crypte/changes.json` : la forme de `packages/cli/src/catalogue/changes.ts`,
// que le shell ne peut pas importer, le CLI étant celui qui l'embarque. Les deux
// copies sont tenues ensemble : `dev.test.ts` fige la forme servie sur une liste
// non vide, `app.test.ts` dessine cette même forme.

export type Change =
  | { kind: 'appeared'; id: string }
  | {
      kind: 'changed'
      id: string
      props?: { before: string[]; after: string[] }
      status?: { before: string; after: string }
    }
  | { kind: 'disappeared'; id: string }

export type TokenChange =
  | { kind: 'appeared'; family: string; key: string; after: Record<string, string> }
  | {
      kind: 'changed'
      family: string
      key: string
      before: Record<string, string>
      after: Record<string, string>
    }
  | { kind: 'disappeared'; family: string; key: string; before: Record<string, string> }

export type Changes =
  | {
      from: { ref: string; commit: string }
      changes: Change[]
      tokens: TokenChange[] | null
    }
  | { reason: string }

const CHANGES = '@crypte/changes.json'

// Où se lisent les changements depuis un point. `crypte dev` lit Git à la
// demande ; un build a écrit un fichier par point, nommé par sa clé en
// hexadécimal comme `pointFile` dans `packages/cli/src/commands/build.ts`.
export function changesUrl(since: { from?: string; before?: string }, built: boolean): string {
  if (built) {
    const key = since.before ? `before:${since.before}` : since.from ? `ref:${since.from}` : null
    if (key === null) return CHANGES
    const hex = Array.from(new TextEncoder().encode(key), (one) =>
      one.toString(16).padStart(2, '0'),
    )
    return `@crypte/changes/${hex.join('')}.json`
  }
  const query = new URLSearchParams()
  if (since.from) query.set('from', since.from)
  if (since.before) query.set('before', since.before)
  const text = query.toString()
  return text === '' ? CHANGES : `${CHANGES}?${text}`
}

// Le composant d'une story qui n'existe plus, lu dans son identifiant : celui-ci
// est le préfixe du composant, `--`, puis le nom (§4.3). Un segment normalisé ne
// porte jamais deux tirets de suite.
export const componentOfId = (id: string) =>
  id.includes('--') ? id.slice(0, id.indexOf('--')) : null
