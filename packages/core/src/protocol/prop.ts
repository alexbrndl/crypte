// What can be said about a prop, on both sides: what an author writes, and what
// the manifest carries once inference has run.

// What you write in `details`. Extends the plugin extension point, so it is
// never empty, which is what makes TypeScript refuse an unknown key.
export interface PropDetails extends PluginPropDetails {
  type?: PropKind
  required?: boolean
  default?: unknown
  description?: string
  options?: unknown[]
}

// What the manifest carries. Inference fills in what the author left out.
export interface ResolvedPropDetails extends PropDetails {
  type: PropKind
  required: boolean
}

// `unknown` when inference fails: a prop stays documented, and the story renders.
export type PropKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'object'
  | 'array'
  | 'function'
  | 'node'
  | 'unknown'

// Empty here. A plugin adds its own fields by module augmentation:
// `declare module '@crypte/core/protocol' { interface PluginPropDetails { min?: number } }`
export interface PluginPropDetails {}
