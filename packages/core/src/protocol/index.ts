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

// What can be said about a token, once a plugin has read it
export type { TokenValue, TokenInTheme, TokenKind } from './tokens'

// What the CLI writes from it, and the shell reads
export type {
  Manifest,
  SkippedFile,
  ManifestEntry,
  StoryEntry,
  ComponentRef,
  TokensEntry,
} from './manifest'
export { MANIFEST_VERSION } from './manifest'

// How a story is named
export { normalizeSegment, storyId } from './id'

// What a plugin is, and what its node surface may contribute
export type {
  CryptePlugin,
  UIContribution,
  PreviewHooks,
  NodeHooks,
  NodeContext,
  ContributedEntry,
} from './plugin'
export { CONTRIBUTABLE } from './plugin'

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
