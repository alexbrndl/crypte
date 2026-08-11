// Les messages échangés entre le shell et la preview. Rien d'autre ne traverse
// la frontière.

export type ShellMessage =
  | { type: 'render'; id: string; overrides: Overrides }
  | { type: 'update-overrides'; id: string; overrides: Overrides }
  | { type: 'set-globals'; globals: Record<string, unknown> }
  | MessagesOf<PluginShellMessages>

export type PreviewMessage =
  | { type: 'ready'; protocolVersion: number }
  | { type: 'rendered'; id: string; durationMs: number }
  | { type: 'error'; id: string; message: string; stack?: string }
  | MessagesOf<PluginPreviewMessages>

// Ne retient que ce qui a la forme d'un message. Sans ce filtre, un plugin
// déclarant `{ x: string }` ferait entrer `string` dans l'union, et plus aucun
// `message.type` ne compilerait chez le consommateur.
type MessagesOf<T> = Extract<T[keyof T], { type: string }>

// Le canal ne transporte jamais les props d'une story : la preview importe les
// modules directement. Il transporte les valeurs éditées dans un panneau.
export type Overrides = Record<string, unknown>

export const PROTOCOL_VERSION = 1

// Vides ici. Un plugin y déclare ses messages par augmentation de module :
// `declare module '@crypte/core/protocol' { interface PluginShellMessages { x: { type: 'x' } } }`
export interface PluginShellMessages {}
export interface PluginPreviewMessages {}
