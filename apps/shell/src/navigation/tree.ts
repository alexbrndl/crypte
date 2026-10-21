// L'arbre de navigation, tiré du manifeste : un dossier par segment du chemin
// sauf le dernier, le composant pour le dernier, ses stories dessous. Une famille
// de tokens et une page n'ont pas de composant : tout leur chemin est fait de
// dossiers. Aucun titre n'est déclaré nulle part, section 1.1 des contrats.

import {
  normalizeSegment,
  storyId,
  type PageEntry,
  type StoryEntry,
  type StoryMeta,
  type TokensEntry,
} from '@crypte/core/protocol'

export type Status = NonNullable<StoryMeta['status']>

export const STATUSES: readonly Status[] = ['draft', 'stable', 'deprecated']

export type Node =
  | { kind: 'folder'; key: string; name: string; children: Node[] }
  | {
      kind: 'component'
      key: string
      // Celui de l'adresse `?component=` : `storyId(path, '')`.
      id: string
      name: string
      status?: Status
      children: Node[]
    }
  | { kind: 'story'; key: string; name: string; entry: StoryEntry }
  | { kind: 'tokens'; key: string; name: string; entry: TokensEntry }
  | { kind: 'page'; key: string; name: string; entry: PageEntry }

// Préfixées par leur nature : un dossier et un composant peuvent porter le même
// chemin, et une story garde son identifiant, qui est déjà unique.
const folderKey = (path: readonly string[]) => `folder:${storyId(path, '')}`
const componentKey = (path: readonly string[]) => `component:${componentIdOf(path)}`

// Le préfixe que partagent toutes les stories du composant.
export const componentIdOf = (path: readonly string[]) => storyId(path, '')

// Dans l'ordre du manifeste. Le statut est celui du composant : `meta` se déclare
// par fichier de stories, donc toutes ses stories portent le même.
export type Listed = StoryEntry | TokensEntry | PageEntry

export function treeOf(entries: readonly Listed[]): Node[] {
  const roots: Node[] = []
  const branches = new Map<string, Extract<Node, { children: Node[] }>>()

  for (const entry of entries) {
    let siblings = roots

    entry.path.forEach((segment, at) => {
      const path = entry.path.slice(0, at + 1)
      const last = entry.type === 'story' && at === entry.path.length - 1
      const key = last ? componentKey(path) : folderKey(path)

      let branch = branches.get(key)
      if (!branch) {
        branch = last
          ? {
              kind: 'component',
              key,
              id: componentIdOf(path),
              name: segment,
              status: entry.type === 'story' ? entry.meta?.status : undefined,
              children: [],
            }
          : { kind: 'folder', key, name: segment, children: [] }
        branches.set(key, branch)
        siblings.push(branch)
      }
      siblings = branch.children
    })

    siblings.push(
      entry.type === 'story'
        ? { kind: 'story', key: entry.id, name: entry.name, entry }
        : entry.type === 'tokens'
          ? { kind: 'tokens', key: entry.id, name: entry.name, entry }
          : { kind: 'page', key: entry.id, name: entry.name, entry },
    )
  }

  return roots
}

// Comparé replié, comme un identifiant mais sans séparateurs : `libelle long`
// trouve `Libellé long`, et `order summary` trouve `OrderSummary`.
export const fold = (text: string) => normalizeSegment(text).replaceAll('-', '')

// Ce que le filtre de statut grise, par clé : il n'enlève rien de l'arbre, qui
// garde sa forme et ses replis. Un composant hors du statut choisi, ou qui n'en
// déclare aucun, est grisé avec ses stories ; une famille de tokens et une page,
// qui n'ont pas de statut, aussi ; un dossier quand rien dessous ne correspond.
export function dimmed(nodes: readonly Node[], status: Status | null): Set<string> {
  const out = new Set<string>()
  if (status === null) return out

  const visit = (node: Node, off: boolean): boolean => {
    if (!('children' in node)) {
      const grey = off || node.kind !== 'story'
      if (grey) out.add(node.key)
      return !grey
    }
    const here = off || (node.kind === 'component' && node.status !== status)
    const lit = node.children.map((child) => visit(child, here)).some(Boolean)
    if (!lit) out.add(node.key)
    return lit
  }

  for (const node of nodes) visit(node, false)
  return out
}

export function branchKeys(nodes: readonly Node[]): string[] {
  return nodes.flatMap((node) =>
    'children' in node ? [node.key, ...branchKeys(node.children)] : [],
  )
}

// Les branches qui contiennent une entrée, depuis la racine.
export function keysAbove(entry: Listed): string[] {
  return entry.path.map((_, at) => {
    const path = entry.path.slice(0, at + 1)
    return entry.type === 'story' && at === entry.path.length - 1
      ? componentKey(path)
      : folderKey(path)
  })
}
