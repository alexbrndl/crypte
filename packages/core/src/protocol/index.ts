// Porte d'entrée de @crypte/core/protocol : ne fait que réexporter, pour que le
// découpage interne reste invisible des paquets qui en dépendent.

export { PROTOCOL_VERSION } from './channel'
export type { Overrides, PreviewMessage, ShellMessage } from './channel'

export { normalizeSegment, storyId } from './id'

export { MANIFEST_VERSION } from './manifest'
export type {
  ArgType,
  ArgTypeKind,
  ComponentRef,
  ControlSpec,
  Manifest,
  ManifestEntry,
  StoryEntry,
} from './manifest'

export type {
  ControlOverride,
  EntryMeta,
  Story,
  StoryDefinition,
  StoryOptions,
  Wrap,
  WrapEntry,
} from './story'
