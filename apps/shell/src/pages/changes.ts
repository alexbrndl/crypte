// Où se lisent les changements que sert `crypte dev`, ou qu'un build a écrits.

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
