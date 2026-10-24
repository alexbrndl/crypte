import type { StoryEntry, TokensEntry } from '@crypte/core/protocol'
import type { Change, TokenChange } from '@crypte/core/protocol'
import { nameOf } from '../tokens/categories'

// Les écarts de la vue versions, une ligne chacun : son signe, son libellé et le
// détail qui dit ce qui a bougé. La clé est celle de l'adresse.

export type Difference =
  | {
      nature: 'story'
      key: string
      kind: Change['kind']
      label: string
      detail: string
      change: Change
      entry?: StoryEntry
    }
  | {
      nature: 'token'
      key: string
      kind: TokenChange['kind']
      label: string
      detail: string
      change: TokenChange
      // Le nom que lit un `var(--…)`, sans ses tirets.
      name: string
    }

// Le point de départ en mots : le CLI nomme une date `before 2026-09-16`.
export const sinceLabel = (ref: string) =>
  ref === 'HEAD' ? 'the last commit' : ref.startsWith('before ') ? ref.slice(7) : ref

export const storyKey = (id: string) => `story:${id}`
export const tokenKey = (family: string, key: string) => `token:${family}/${key}`

export function differencesOf(
  changes: readonly Change[],
  tokens: readonly TokenChange[],
  stories: readonly StoryEntry[],
  families: readonly TokensEntry[],
): { tokens: Difference[]; stories: Difference[] } {
  return {
    tokens: tokens.map((change) => {
      // La famille d'aujourd'hui donne le nom ; partie, sa clé seule le dit.
      const family = families.find((one) => one.id === change.family)
      const name = family ? nameOf(family.name, change.key) : change.key
      return {
        nature: 'token' as const,
        key: tokenKey(change.family, change.key),
        kind: change.kind,
        label: name,
        detail: change.kind === 'changed' ? movedThemes(change).join(', ') : 'token',
        change,
        name,
      }
    }),
    stories: changes.map((change) => {
      const entry = stories.find((one) => one.id === change.id)
      return {
        nature: 'story' as const,
        key: storyKey(change.id),
        kind: change.kind,
        label: entry?.name ?? change.id,
        detail: detailOf(change, entry),
        change,
        ...(entry ? { entry } : {}),
      }
    }),
  }
}

// Les thèmes dont la valeur a bougé, ou qu'un seul côté déclare.
export function movedThemes(change: Extract<TokenChange, { kind: 'changed' }>): string[] {
  const themes = [...new Set([...Object.keys(change.before), ...Object.keys(change.after)])]
  return themes.filter((theme) => change.before[theme] !== change.after[theme])
}

function detailOf(change: Change, entry: StoryEntry | undefined): string {
  if (change.kind !== 'changed') return entry ? entry.path.join(' / ') : 'story'
  return [
    change.props ? 'props' : null,
    change.status ? `${change.status.before} → ${change.status.after}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
