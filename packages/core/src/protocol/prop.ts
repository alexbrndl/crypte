// What can be said about a prop, on both sides: what an author writes, and what
// the manifest carries once inference has run.

// What you write in `details`. Every field is optional: you only fill in what
// inference could not find.
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

// A failed inference gives `unknown` rather than nothing: the prop stays
// documented, and the story still renders.
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
