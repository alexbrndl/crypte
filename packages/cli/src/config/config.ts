// What a project writes in `crypte.config.ts`. See section 1.5 of docs/contracts.md.

import type {
  CryptePlugin,
  Locale,
  PanelEvents,
  PanelProps,
  PluginView,
  MountContext,
  PreviewContext,
  PreviewHooks,
  ShellView,
  ViewEvents,
  ViewLabel,
  ViewProps,
} from '@crypte/core/protocol'
import type { Adapter } from '@crypte/core/preview'
import actions from '@crypte/actions'
import controls from '@crypte/controls'
import source from '@crypte/source'
import tokens from '@crypte/tokens'
import type { PluginOption } from 'vite'

export interface CrypteConfig {
  // Root of the story files, relative to the project root.
  stories: string
  adapter: Adapter
  // Style sheet loaded in the preview, the project's own.
  css?: string
  // Root of the component files, relative to the project root: what the health
  // view counts the components with a story against.
  components?: string
  // Wrapper applied to every story, outside the file's own. Opaque like the
  // adapter: `Wrap<unknown>` would collapse to `unknown`, and the field would
  // look typed while constraining nothing.
  wrap?: GlobalWrap
  plugins?: CryptePlugin[]
  // Transforms the project needs, Nuxt auto-imports for example. Crypte never
  // guesses them: it does not read the project's `vite.config`.
  vite?: { plugins?: PluginOption[] }
}

// Returns the configuration as is, for types and autocompletion.
export function defineConfig(config: CrypteConfig): CrypteConfig {
  return config
}

// What a configuration with no `plugins` field gets, section 1.5. A field that
// is there takes exactly what it lists, so a project spreads this to keep them.
export const defaultPlugins: CryptePlugin[] = [controls(), tokens(), source(), actions()]

// Opaque here: the CLI carries it and never reads it, and its components belong
// to the adapter.
export type GlobalWrap = unknown

// Re-exported rather than redeclared: the plugin contract spans the three
// surfaces, so it lives in the protocol and not in one consumer's config.
// Here because a project installs this package and not the core, which it
// cannot import: a plugin of its own types its panel and hooks from here.
export type {
  Adapter,
  CryptePlugin,
  PanelProps,
  PanelEvents,
  PreviewHooks,
  MountContext,
  PreviewContext,
  PluginView,
  ViewLabel,
  Locale,
  ShellView,
  ViewProps,
  ViewEvents,
}
