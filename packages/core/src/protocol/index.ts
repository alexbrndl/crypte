// The door into @crypte/core/protocol: re-exports only, one group per module,
// in the order a story travels through them.

// What can be said about a prop
export type { PropDetails, ResolvedPropDetails, PropKind, PluginPropDetails } from './prop'

// What you write in a story file
export type {
  StoryDefinition,
  Story,
  StoryOptions,
  Wrap,
  WrapEntry,
  StoryMeta,
  PluginStoryOptions,
} from './story'

// What the CLI writes from it, and the shell reads
export type { Manifest, ManifestEntry, StoryEntry, ComponentRef } from './manifest'
export { MANIFEST_VERSION } from './manifest'

// How a story is named
export { normalizeSegment, storyId } from './id'

// How the shell and the preview talk
export type {
  ShellMessage,
  PreviewMessage,
  Overrides,
  PluginShellMessages,
  PluginPreviewMessages,
  PluginMessage,
} from './channel'
export { PROTOCOL_VERSION } from './channel'
