// Porte d'entrée de @crypte/core/protocol : ne fait que réexporter, pour que le
// découpage interne reste invisible des paquets qui en dépendent.

export { PROTOCOL_VERSION } from './channel'
export type { Overrides, PreviewMessage, ShellMessage } from './channel'

export { normalizeSegment, storyId } from './id'

export { MANIFEST_VERSION } from './manifest'
export type {
  ComponentRef,
  Manifest,
  ManifestEntry,
  PluginPropDetails,
  PropDetails,
  PropKind,
  StoryEntry,
} from './manifest'

export type {
  EntryMeta,
  PluginStoryOptions,
  PropDetailsInput,
  Story,
  StoryDefinition,
  StoryOptions,
  Wrap,
  WrapEntry,
} from './story'
