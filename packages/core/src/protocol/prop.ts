// Tout ce qu'on peut dire d'une prop, des deux côtés.

// Ce qu'on écrit dans `details`, en complément de l'inférence. Tout est
// facultatif : on ne précise que ce que l'inférence n'a pas trouvé.
export interface PropDetails extends PluginPropDetails {
  type?: PropKind
  required?: boolean
  default?: unknown
  description?: string
  options?: unknown[]
}

// La même chose une fois l'inférence faite. Le shell a besoin de `type` et de
// `required` pour afficher la prop, donc le manifeste les porte toujours.
export interface ResolvedPropDetails extends PropDetails {
  type: PropKind
  required: boolean
}

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

// Vide ici. Un plugin y ajoute ses champs par augmentation de module :
// `declare module '@crypte/core/protocol' { interface PluginPropDetails { min?: number } }`
export interface PluginPropDetails {}
