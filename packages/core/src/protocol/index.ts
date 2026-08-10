export const PROTOCOL_VERSION = 1

export type Overrides = Record<string, unknown>

export type ShellMessage =
  | { type: 'render'; id: string; overrides: Overrides }
  | { type: 'update-overrides'; id: string; overrides: Overrides }
  | { type: 'set-globals'; globals: Record<string, unknown> }
  | { type: 'plugin'; plugin: string; payload: unknown }

export type PreviewMessage =
  | { type: 'ready'; manifestVersion: number }
  | { type: 'rendered'; id: string; durationMs: number }
  | { type: 'error'; id: string; message: string; stack?: string }
  | { type: 'plugin'; plugin: string; payload: unknown }
