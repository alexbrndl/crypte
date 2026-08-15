// Où retomber quand l'identifiant affiché a disparu du catalogue.
// Voir docs/internal/architecture.md.

import type { StoryEntry } from '@crypte/core/protocol'

// L'identifiant vient du chemin et du nom, donc renommer une story le change et
// la sélection ne se retrouve plus. Le fichier et le rang dans ce fichier y
// survivent : sur un renommage sur place, ils désignent la story renommée.
//
// Perdre la place à chaque frappe est pire que ne pas recharger du tout, d'où un
// repli plutôt qu'une sélection vide.
export function recovered(
  shown: StoryEntry | null | 'effacée',
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
