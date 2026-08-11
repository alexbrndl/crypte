// Porte d'entrée de @crypte/core/protocol : ne fait que réexporter, un groupe
// par module, dans l'ordre du parcours d'une story.

// Ce qu'on peut dire d'une prop
export type { PropDetails, ResolvedPropDetails, PropKind, PluginPropDetails } from './prop'

// Ce qu'on écrit dans un fichier de stories
export type {
  StoryDefinition,
  Story,
  StoryOptions,
  Wrap,
  WrapEntry,
  StoryMeta,
  PluginStoryOptions,
} from './story'

// Ce que le CLI en produit et que le shell lit
export type { Manifest, ManifestEntry, StoryEntry, ComponentRef } from './manifest'
export { MANIFEST_VERSION } from './manifest'

// Comment une story est désignée
export { normalizeSegment, storyId } from './id'

// Comment le shell et la preview se parlent
export type {
  ShellMessage,
  PreviewMessage,
  Overrides,
  PluginShellMessages,
  PluginPreviewMessages,
  PluginMessage,
} from './channel'
export { PROTOCOL_VERSION } from './channel'
