// Porte d'entrée de @crypte/core/protocol : ne fait que réexporter, un groupe
// par module, dans l'ordre du parcours d'une story.

// Ce qu'on peut dire d'une prop
export type { PluginPropDetails, PropDetails, PropKind, ResolvedPropDetails } from './prop'

// Ce qu'on écrit dans un fichier de stories
export type {
  PluginStoryOptions,
  Story,
  StoryDefinition,
  StoryMeta,
  StoryOptions,
  Wrap,
  WrapEntry,
} from './story'

// Ce que le CLI en produit et que le shell lit
export { MANIFEST_VERSION } from './manifest'
export type { ComponentRef, Manifest, ManifestEntry, StoryEntry } from './manifest'

// Comment une story est désignée
export { normalizeSegment, storyId } from './id'

// Comment le shell et la preview se parlent
export { PROTOCOL_VERSION } from './channel'
export type {
  Overrides,
  PluginPreviewMessages,
  PluginShellMessages,
  PreviewMessage,
  ShellMessage,
} from './channel'
