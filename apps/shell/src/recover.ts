// Où retomber quand l'identifiant affiché a disparu du catalogue.
// Voir docs/internal/architecture.md.

import type { StoryEntry } from '@crypte/core/protocol'

// Ce qu'un catalogue illisible laisse à l'écran. Un arbre qui se fige sans un
// mot ressemble à un outil qui a cessé de suivre, ce que le panneau d'erreur
// défend déjà pour un rendu raté.
export function unreadable(error: unknown): string {
  return `catalogue illisible : ${error instanceof Error ? error.message : String(error)}`
}

// Ce que le shell devient après un rafraîchissement : la story à afficher, ce
// qu'il faut retenir de l'affichée, et ce qu'il y a à dire. Sorti du composant
// parce que la distinction « rien n'a jamais été affiché » / « la sélection
// vient d'être perdue » ne s'éprouve pas depuis un rendu Vue.
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

  return { id: null, shown: 'effacée', status: 'la story affichée a disparu' }
}

export type Shown = StoryEntry | null | 'effacée'

// L'identifiant vient du chemin et du nom, donc renommer une story le change et
// la sélection ne se retrouve plus. Le fichier et le rang dans ce fichier y
// survivent : sur un renommage sur place, ils désignent la story renommée.
//
// Perdre la place à chaque frappe est pire que ne pas recharger du tout, d'où un
// repli plutôt qu'une sélection vide.
export function recovered(
  shown: Shown,
  before: readonly StoryEntry[],
  after: readonly StoryEntry[],
): string | null {
  // Trois états, pas deux. `null` est « rien n'a jamais été affiché », qui veut
  // la première story ; `'effacée'` est « la sélection vient d'être perdue »,
  // qui ne veut rien. Confondus, une sauvegarde sur un autre fichier faisait
  // sauter sur la première story du catalogue juste après avoir dit qu'il n'y
  // avait plus rien à afficher.
  if (shown === 'effacée') return null
  if (shown === null) return after[0]?.id ?? null
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
