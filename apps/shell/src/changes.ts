// Ce que sert `/@crypte/changes.json` : la forme de `packages/cli/src/changes.ts`,
// que le shell ne peut pas importer, le CLI étant celui qui l'embarque. Le cas
// navigateur du mode changements lit les deux moitiés ensemble.

export type Change =
  | { kind: 'appeared'; id: string }
  | {
      kind: 'changed'
      id: string
      props?: { before: string[]; after: string[] }
      status?: { before: string; after: string }
    }
  | { kind: 'disappeared'; id: string }

export type Changes = { changes: Change[] } | { reason: string }

export const CHANGES = '/@crypte/changes.json'

// Le composant d'une story qui n'existe plus, lu dans son identifiant : celui-ci
// est le préfixe du composant, `--`, puis le nom (§4.3). Un segment normalisé ne
// porte jamais deux tirets de suite.
export const componentOfId = (id: string) =>
  id.includes('--') ? id.slice(0, id.indexOf('--')) : null
