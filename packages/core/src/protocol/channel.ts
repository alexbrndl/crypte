// Les messages échangés entre le shell et la preview, dans les deux sens.
// Consommé par core/ui côté shell et core/preview côté iframe. Rien d'autre ne
// traverse la frontière.

export const PROTOCOL_VERSION = 1

// Le canal ne transporte jamais les props d'une story : la preview importe les
// modules directement. Il transporte l'identifiant de l'entrée à rendre et les
// surcharges issues des controls, toujours des valeurs primitives éditées dans
// un panneau, donc toujours sérialisables.
export type Overrides = Record<string, unknown>

export type ShellMessage =
  | { type: 'render'; id: string; overrides: Overrides }
  | { type: 'update-overrides'; id: string; overrides: Overrides }
  | { type: 'set-globals'; globals: Record<string, unknown> }
  | { type: 'plugin'; plugin: string; payload: unknown }

export type PreviewMessage =
  | { type: 'ready'; protocolVersion: number }
  | { type: 'rendered'; id: string; durationMs: number }
  | { type: 'error'; id: string; message: string; stack?: string }
  | { type: 'plugin'; plugin: string; payload: unknown }
