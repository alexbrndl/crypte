// Le catalogue produit par le CLI et lu par le shell. Sérialisable de bout en bout.

import type { ResolvedPropDetails } from './prop'
import type { StoryMeta } from './story'

export interface Manifest {
  version: typeof MANIFEST_VERSION
  entries: ManifestEntry[]
}

// `page` et `tokens` sont réservées aux évolutions design system : le champ
// existe déjà pour qu'elles n'imposent pas de migration.
export type ManifestEntry = StoryEntry

export interface StoryEntry {
  type: 'story'
  id: string
  path: string[]
  name: string
  component: ComponentRef
  storyFile: string
  // Ouvert parce que ce champ ne contient que des réglages de plugins : le noyau
  // n'a rien à y typer, et le lecteur n'a pas forcément les mêmes plugins.
  options: Record<string, unknown>
  // Indexé par nom de prop, d'où l'absence de champ `name` dans la valeur.
  details: Record<string, ResolvedPropDetails>
  source: string
  meta?: StoryMeta
}

export interface ComponentRef {
  name: string
  file: string
  export: string
}

export const MANIFEST_VERSION = 1
