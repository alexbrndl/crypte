// La vue santé : les composants du dossier déclaré, et ce qui les décrit. Les
// données viennent de `/@crypte/health.json`, la forme de
// `packages/cli/src/catalogue/health.ts`, que le shell ne peut pas importer. Le
// dashboard en tire tout le reste, dans `dashboard.ts`.

import type { StoryEntry } from '@crypte/core/protocol'
import { locale } from '../i18n'

// Une story nommée « Composant / Story » ; une story absent du catalogue garde
// son identifiant.
export function storyName(stories: StoryEntry[], id: string): string {
  const story = stories.find((one) => one.id === id)
  return story ? `${story.path.at(-1)} / ${story.name}` : id
}

export interface HealthComponent {
  name: string
  file: string
  export: string
  stories: string[]
  props: number
  // Celles qu'une story doit donner : sans aucune, `Default` suffit.
  required: number
  status?: 'draft' | 'stable' | 'deprecated'
  changed?: string
  statusSince?: string
  skeleton?: { file: string; source: string }
  // Les composants du dossier qui l'importent, par leur clé : où un composant
  // déprécié sert encore.
  usedBy?: string[]
  // Les props qu'aucune de ses stories ne donne.
  unexercised?: string[]
  // Les fichiers de l'application qui l'importent, hors dossier et stories.
  usedIn?: string[]
  // Les propriétés personnalisées que son fichier lit, story ou pas.
  tokens?: string[]
}

export interface Health {
  components: HealthComponent[] | null
}

// La clé d'un composant dans l'adresse : son fichier et son export, deux
// composants du même nom dans deux fichiers restant distincts.
export const keyOf = (one: HealthComponent) => `${one.file}:${one.export}`

// Un jour court, `14 Oct` ou `14 oct.`, pour les dates d'un tableau.
export const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString(locale.value === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
