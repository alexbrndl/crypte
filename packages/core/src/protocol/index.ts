// Porte d'entrée de @crypte/core/protocol : ne fait que réexporter, pour que le
// découpage interne reste invisible des paquets qui en dépendent.
//
// Quatre groupes, dans l'ordre du parcours : ce qu'on écrit, ce qui en est
// produit, comment on le désigne, et comment il s'affiche.

// --- Ce qu'un développeur écrit dans un fichier de stories -------------------
// `StoryDefinition` est la forme du fichier entier, `Story` celle d'une entrée.
// `details` reçoit des `PropDetailsInput`, complémentaires de l'inférence.
export type {
  EntryMeta,
  PropDetailsInput,
  Story,
  StoryDefinition,
  StoryOptions,
  Wrap,
  WrapEntry,
} from './story'

// --- Ce que le CLI produit et que le shell lit -------------------------------
// `Manifest` est le catalogue complet, `StoryEntry` une story qu'il décrit, et
// `PropDetails` ce qu'on sait d'une de ses props une fois l'inférence faite.
export { MANIFEST_VERSION } from './manifest'
export type {
  ComponentRef,
  Manifest,
  ManifestEntry,
  PropDetails,
  PropKind,
  StoryEntry,
} from './manifest'

// --- Comment une story est désignée ------------------------------------------
// L'identifiant sert d'URL et de clé de baseline. Seul code réellement exécuté
// du protocole, tout le reste n'existe qu'à la compilation.
export { normalizeSegment, storyId } from './id'

// --- Comment le shell et la preview se parlent -------------------------------
// Deux directions distinctes : `ShellMessage` va vers l'iframe, `PreviewMessage`
// en revient.
export { PROTOCOL_VERSION } from './channel'
export type { Overrides, PreviewMessage, ShellMessage } from './channel'

// --- Ce qu'un plugin remplit --------------------------------------------------
// Vides ici, et c'est le principe : un plugin y ajoute ses champs depuis son
// propre paquet, par augmentation de module. Le noyau ne connaît aucun d'eux.
// Voir la section 3.3 de docs/spec-contrats.md.
export type { PluginPropDetails } from './manifest'
export type { PluginStoryOptions } from './story'
