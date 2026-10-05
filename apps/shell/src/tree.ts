// L'arbre de navigation, tiré du manifeste : un dossier par segment du chemin
// sauf le dernier, le composant pour le dernier, ses stories dessous. Aucun titre
// n'est déclaré nulle part, section 1.1 des contrats.

import { normalizeSegment, storyId, type StoryEntry, type StoryMeta } from '@crypte/core/protocol'

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

// Préfixées par leur nature : un dossier et un composant peuvent porter le même
// chemin, et une story garde son identifiant, qui est déjà unique.
const folderKey = (path: readonly string[]) => `folder:${storyId(path, '')}`
const componentKey = (path: readonly string[]) => `component:${componentIdOf(path)}`

// Le préfixe que partagent toutes les stories du composant.
export const componentIdOf = (path: readonly string[]) => storyId(path, '')

// Dans l'ordre du manifeste. Le statut est celui du composant : `meta` se déclare
// par fichier de stories, donc toutes ses stories portent le même.
export function treeOf(entries: readonly StoryEntry[]): Node[] {
  const roots: Node[] = []
  const branches = new Map<string, Extract<Node, { children: Node[] }>>()

  for (const entry of entries) {
    let siblings = roots

    entry.path.forEach((segment, at) => {
      const path = entry.path.slice(0, at + 1)
      const last = at === entry.path.length - 1
      const key = last ? componentKey(path) : folderKey(path)

      let branch = branches.get(key)
      if (!branch) {
        branch = last
          ? {
              kind: 'component',
              key,
              id: componentIdOf(path),
              name: segment,
              status: entry.meta?.status,
              children: [],
            }
          : { kind: 'folder', key, name: segment, children: [] }
        branches.set(key, branch)
        siblings.push(branch)
      }
      siblings = branch.children
    })

    siblings.push({ kind: 'story', key: entry.id, name: entry.name, entry })
  }

  return roots
}

// Comparé replié, comme un identifiant mais sans séparateurs : `libelle long`
// trouve `Libellé long`, et `order summary` trouve `OrderSummary`.
const fold = (text: string) => normalizeSegment(text).replaceAll('-', '')

// Une story reste si son nom contient la recherche, ou si un composant ou un
// dossier au-dessus d'elle la contient. Le filtre de statut écarte les
// composants hors des statuts choisis, et ceux qui n'en déclarent aucun. Une
// branche sans rien dessous disparaît.
export function filtered(
  nodes: readonly Node[],
  query: string,
  statuses: readonly Status[],
): Node[] {
  const wanted = fold(query)

  const keep = (node: Node, above: boolean): Node | null => {
    if (node.kind === 'story') return above || fold(node.name).includes(wanted) ? node : null
    if (node.kind === 'component' && statuses.length > 0) {
      if (!node.status || !statuses.includes(node.status)) return null
    }

    const here = above || fold(node.name).includes(wanted)
    const children = node.children.flatMap((child) => keep(child, here) ?? [])
    return children.length > 0 ? { ...node, children } : null
  }

  return nodes.flatMap((node) => keep(node, false) ?? [])
}

export function branchKeys(nodes: readonly Node[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === 'story' ? [] : [node.key, ...branchKeys(node.children)],
  )
}

// Les branches qui contiennent une story, du dossier racine au composant.
export function keysAbove(entry: StoryEntry): string[] {
  return entry.path.map((_, at) => {
    const path = entry.path.slice(0, at + 1)
    return at === entry.path.length - 1 ? componentKey(path) : folderKey(path)
  })
}
