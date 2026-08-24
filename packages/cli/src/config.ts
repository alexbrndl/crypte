// What a project writes in `crypte.config.ts`. See section 1.5 of docs/contracts.md.

import type { CryptePlugin } from '@crypte/core/protocol'
import type { PluginOption } from 'vite'

export interface CrypteConfig {
  // Root of the story files, relative to the project root.
  stories: string
  adapter: Adapter
  // Style sheet loaded in the preview, the project's own.
  css?: string
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

// Opaque here: the CLI carries them and never reads them. Their shape belongs
// to the adapter, whose own lot introduces it.
export type Adapter = unknown
export type GlobalWrap = unknown

// Re-exported rather than redeclared: the plugin contract spans the three
// surfaces, so it lives in the protocol and not in one consumer's config.
export type { CryptePlugin }
