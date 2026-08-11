// Les messages échangés entre le shell et la preview. Rien d'autre ne traverse
// la frontière.

export type ShellMessage =
  | { type: 'render'; id: string; overrides: Overrides }
  | { type: 'update-overrides'; id: string; overrides: Overrides }
  | { type: 'set-globals'; globals: Record<string, unknown> }
  | PluginShellMessages[keyof PluginShellMessages]

export type PreviewMessage =
  | { type: 'ready'; protocolVersion: number }
  | { type: 'rendered'; id: string; durationMs: number }
  | { type: 'error'; id: string; message: string; stack?: string }
  | PluginPreviewMessages[keyof PluginPreviewMessages]

// Le canal ne transporte jamais les props d'une story : la preview importe les
// modules directement. Il transporte les valeurs éditées dans un panneau.
export type Overrides = Record<string, unknown>

export const PROTOCOL_VERSION = 1

// Vides ici. Un plugin y déclare ses messages par augmentation de module :
// `declare module '@crypte/core/protocol' { interface PluginShellMessages { x: { type: 'x' } } }`
export interface PluginShellMessages {}
export interface PluginPreviewMessages {}
