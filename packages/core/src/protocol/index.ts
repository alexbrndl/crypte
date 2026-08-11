// Porte d'entrée de @crypte/core/protocol. Ne fait que réexporter, dans l'ordre
// du parcours : ce qu'on écrit, ce qui en est produit, comment on le désigne,
// comment il s'affiche, et ce qu'un plugin remplit.

export type { PropDetails, PropKind } from './prop'
export type { Story, StoryDefinition, StoryMeta, StoryOptions, Wrap, WrapEntry } from './story'

export { MANIFEST_VERSION } from './manifest'
export type { ComponentRef, Manifest, ManifestEntry, StoryEntry } from './manifest'
export type { ResolvedPropDetails } from './prop'

export { normalizeSegment, storyId } from './id'

export { PROTOCOL_VERSION } from './channel'
export type { Overrides, PreviewMessage, ShellMessage } from './channel'

export type { PluginPreviewMessages, PluginShellMessages } from './channel'
export type { PluginPropDetails } from './prop'
export type { PluginStoryOptions } from './story'
