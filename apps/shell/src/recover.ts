// Où retomber quand l'identifiant affiché a disparu du catalogue.

import type { StoryEntry } from '@crypte/core/protocol'

// Ce qu'un catalogue illisible laisse à l'écran. Un arbre qui se fige sans un
// mot ressemble à un outil qui a cessé de suivre, ce que le panneau d'erreur
// défend déjà pour un rendu raté.
export function unreadable(error: unknown): string {
  return `catalogue illisible : ${error instanceof Error ? error.message : String(error)}`
}

// Hors du composant pour être testable : la distinction entre `null`, une entrée
// et une story perdue ne s'éprouve pas depuis un rendu Vue.
export function landing(
  shown: Shown,
  before: readonly StoryEntry[],
  after: readonly StoryEntry[],
): { id: string | null; shown: Shown; status: string | undefined } {
  const id = recovered(shown, before, after)
  if (id !== null) return { id, shown, status: undefined }

  // Un catalogue vide n'a rien perdu. Marqué comme une sélection perdue, il ne
  // se sélectionnait plus jamais tout seul une fois la première story écrite.
  if (after.length === 0) return { id: null, shown, status: undefined }

  // La story perdue est gardée, avec le catalogue d'où elle a disparu : quand
  // son fichier revient, c'est elle qu'on retrouve.
  const lost = shown !== null && 'lost' in shown ? shown : { lost: shown as StoryEntry, before }
  return { id: null, shown: lost, status: 'la story affichée a disparu' }
}

// `lost` : la sélection vient d'être perdue, avec le catalogue d'où elle a
// disparu, pour la retrouver si son fichier revient.
export type Shown = StoryEntry | null | { lost: StoryEntry; before: readonly StoryEntry[] }

// L'identifiant vient du chemin et du nom : un renommage le change. Le fichier et
// le rang y survivent, d'où le repli sur eux.
export function recovered(
  shown: Shown,
  before: readonly StoryEntry[],
  after: readonly StoryEntry[],
): string | null {
  // `null` (rien n'a jamais été affiché) veut la première story ; une story
  // perdue ne veut qu'elle-même, par les mêmes règles qu'une story présente.
  // Confondus, le shell saute sur la première story juste après avoir dit qu'il
  // n'y a plus rien à afficher.
  if (shown === null) return after[0]?.id ?? null
  if ('lost' in shown) return recovered(shown.lost, shown.before, after)
  if (after.some((entry) => entry.id === shown.id)) return shown.id

  const rank = sameFile(shown.storyFile, before).findIndex((entry) => entry.id === shown.id)
  const siblings = sameFile(shown.storyFile, after)

  // Le fichier entier a disparu : rien de proche à proposer, et prendre la
  // première story d'ailleurs enverrait l'utilisateur sur un composant qu'il
  // n'a pas ouvert.
  if (siblings.length === 0) return null

  // Le rang, sinon la dernière : une story retirée au milieu laisse le rang
  // au-delà de ce que le fichier porte encore.
  return (siblings[rank] ?? siblings[siblings.length - 1])?.id ?? null
}

function sameFile(file: string, entries: readonly StoryEntry[]): StoryEntry[] {
  return entries.filter((entry) => entry.storyFile === file)
}
